import { existsSync, watch } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PhosphorVariant = 'regular' | 'duotone' | 'bold' | 'fill' | 'light' | 'thin';
type BuildScope = 'full' | 'icons';
type BuildTarget = 'dev' | 'prod';

interface IconSpecObject {
  phosphor?: string;
  variant?: PhosphorVariant;
  custom?: string;
}

interface IconManifest {
  defaultVariant?: PhosphorVariant;
  icons: Record<string, string | IconSpecObject>;
}

interface BuildPaths {
  themeDir: string;
  nodeModulesDir: string;
  iconManifestPath: string;
  customIconsDir: string;
  cssEntry: string;
  tsEntry: string;
  buildDir: string;
  cssOutFile: string;
  jsOutDir: string;
  symbolDir: string;
  spriteOutFile: string;
  manifestOutFile: string;
}

const DEBOUNCE_MS = 120;
const PUBLIC_ASSET_BASE = '/themes/strata/client/assets/build';
const DEFAULT_VIEWBOX = '0 0 256 256';

function createBuildPaths(): BuildPaths {
  const themeDir = dirname(fileURLToPath(import.meta.url));
  const buildDir = resolve(themeDir, 'assets/build');

  return {
    themeDir,
    nodeModulesDir: resolve(themeDir, 'node_modules'),
    iconManifestPath: resolve(themeDir, 'icon-manifest.json'),
    customIconsDir: resolve(themeDir, 'custom-icons'),
    cssEntry: resolve(themeDir, 'assets/css/strata.css'),
    tsEntry: resolve(themeDir, 'assets/ts/main.ts'),
    buildDir,
    cssOutFile: join(buildDir, 'css/strata.css'),
    jsOutDir: join(buildDir, 'js'),
    symbolDir: join(buildDir, 'symbol'),
    spriteOutFile: join(buildDir, 'symbol/icons-sprite.svg'),
    manifestOutFile: join(buildDir, 'manifest.json'),
  };
}

function resolvePhosphorFile(spec: IconSpecObject, defaultVariant: PhosphorVariant, paths: BuildPaths): string {
  if (spec.custom) {
    return resolve(paths.customIconsDir, spec.custom);
  }

  const iconName = spec.phosphor;
  if (!iconName) {
    throw new Error('Icon specification must define either "phosphor" or "custom".');
  }

  const variant = spec.variant ?? defaultVariant;
  const fileName = variant === 'regular' ? `${iconName}.svg` : `${iconName}-${variant}.svg`;
  return resolve(paths.nodeModulesDir, '@phosphor-icons/core/assets', variant, fileName);
}

/**
 * Extracts viewBox, fill, and inner geometry from a standalone SVG into a `<symbol>`.
 */
function convertSvgToSymbol(id: string, rawSvg: string): string {
  const openTagMatch = rawSvg.match(/<svg\b([^>]*)>/i);
  const closeTagIndex = rawSvg.lastIndexOf('</svg>');

  if (!openTagMatch || closeTagIndex === -1) {
    throw new Error(`Invalid SVG markup for icon "${id}".`);
  }

  const attrs = openTagMatch[1] ?? '';
  const viewBoxMatch = attrs.match(/viewBox=["']([^"']+)["']/i);
  const fillMatch = attrs.match(/fill=["']([^"']+)["']/i);
  const strokeMatch = attrs.match(/stroke=["']([^"']+)["']/i);

  const viewBox = viewBoxMatch?.[1] ?? DEFAULT_VIEWBOX;
  const fill = fillMatch?.[1] ?? 'currentColor';
  const strokeAttr = strokeMatch?.[1] ? ` stroke="${strokeMatch[1]}"` : '';

  const contentStart = (openTagMatch.index ?? 0) + openTagMatch[0].length;
  const innerMarkup = rawSvg.slice(contentStart, closeTagIndex).replace(/\s+/g, ' ').trim();

  return `<symbol id="${id}" viewBox="${viewBox}" fill="${fill}"${strokeAttr}>${innerMarkup}</symbol>`;
}

/**
 * Generates `assets/build/symbol/icons-sprite.svg` from `icon-manifest.json`.
 */
async function buildIconSprite(paths: BuildPaths): Promise<number> {
  const rawManifest = await readFile(paths.iconManifestPath, 'utf8');
  const manifest = JSON.parse(rawManifest) as IconManifest;
  const defaultVariant: PhosphorVariant = manifest.defaultVariant ?? 'regular';
  const entries = Object.entries(manifest.icons);

  const symbols: string[] = [];
  for (const [id, rawSpec] of entries) {
    const spec: IconSpecObject = typeof rawSpec === 'string' ? { phosphor: rawSpec } : rawSpec;
    const svgPath = resolvePhosphorFile(spec, defaultVariant, paths);

    if (!existsSync(svgPath)) {
      throw new Error(`Missing icon "${id}" at ${svgPath}`);
    }

    const svgContent = await readFile(svgPath, 'utf8');
    symbols.push(convertSvgToSymbol(id, svgContent));
  }

  const spriteSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">',
    ...symbols,
    '</svg>',
    '',
  ].join('\n');

  await mkdir(paths.symbolDir, { recursive: true });
  await writeFile(paths.spriteOutFile, spriteSvg, 'utf8');
  return symbols.length;
}

/**
 * Copies referenced vendor static assets (flag-icons SVGs, intl-tel-input images) alongside `assets/build/css/`.
 */
async function syncReferencedCssAssets(cssContent: string, paths: BuildPaths): Promise<void> {
  if (cssContent.includes('../flags/')) {
    const srcFlags = resolve(paths.nodeModulesDir, 'flag-icons/flags');
    const destFlags = join(paths.buildDir, 'flags');
    if (existsSync(srcFlags)) {
      await cp(srcFlags, destFlags, { recursive: true });
    }
  }

  if (cssContent.includes('../img/flags')) {
    const srcImg = resolve(paths.nodeModulesDir, 'intl-tel-input/dist/img');
    const destImg = join(paths.buildDir, 'img');
    if (existsSync(srcImg)) {
      await cp(srcImg, destImg, { recursive: true });
    }
  }
}

/**
 * Compiles `assets/css/strata.css` with Tailwind CSS v4 CLI (`@tailwindcss/cli`).
 */
async function buildCss(options: { paths: BuildPaths; target: BuildTarget }): Promise<boolean> {
  const { paths, target } = options;
  if (!existsSync(paths.cssEntry)) {
    console.log(`[skip] CSS entry not found yet: ${paths.cssEntry}`);
    return false;
  }

  await mkdir(dirname(paths.cssOutFile), { recursive: true });
  const tailwindBin = resolve(paths.nodeModulesDir, '.bin/tailwindcss');
  const args = [tailwindBin, '-i', paths.cssEntry, '-o', paths.cssOutFile];

  if (target === 'prod') {
    args.push('--minify');
  }

  const proc = Bun.spawn(args, {
    cwd: paths.themeDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Tailwind CSS compilation failed (exit ${exitCode}):\n${stderr}`);
  }

  const compiledCss = await readFile(paths.cssOutFile, 'utf8');
  await syncReferencedCssAssets(compiledCss, paths);
  return true;
}

/**
 * Bundles `assets/ts/main.ts` with `Bun.build` using ESM code splitting.
 */
async function buildJs(options: { paths: BuildPaths; target: BuildTarget }): Promise<boolean> {
  const { paths, target } = options;
  if (!existsSync(paths.tsEntry)) {
    console.log(`[skip] TS entry not found yet: ${paths.tsEntry}`);
    return false;
  }

  await rm(paths.jsOutDir, { recursive: true, force: true });
  await mkdir(paths.jsOutDir, { recursive: true });

  const isDev = target === 'dev';
  const result = await Bun.build({
    entrypoints: [paths.tsEntry],
    outdir: paths.jsOutDir,
    target: 'browser',
    format: 'esm',
    splitting: true,
    minify: !isDev,
    sourcemap: isDev ? 'inline' : 'none',
    drop: isDev ? [] : ['debugger'],
    naming: {
      entry: '[name].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
    },
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join('\n');
    throw new Error(`Bun.build failed:\n${messages}`);
  }

  return true;
}

async function writeBuildManifest(paths: BuildPaths): Promise<void> {
  await mkdir(paths.buildDir, { recursive: true });
  const manifest = {
    'build/css/strata.css': `${PUBLIC_ASSET_BASE}/css/strata.css`,
    'build/js/main.js': `${PUBLIC_ASSET_BASE}/js/main.js`,
    'build/symbol/icons-sprite.svg': `${PUBLIC_ASSET_BASE}/symbol/icons-sprite.svg`,
  };
  await writeFile(paths.manifestOutFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function runBuild(options: { paths: BuildPaths; scope: BuildScope; target: BuildTarget }): Promise<void> {
  const { paths, scope, target } = options;
  const startedAt = performance.now();

  const iconCount = await buildIconSprite(paths);
  let builtCss = false;
  let builtJs = false;

  if (scope === 'full') {
    builtCss = await buildCss({ paths, target });
    builtJs = await buildJs({ paths, target });
  }

  await writeBuildManifest(paths);
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(
    `[strata] Build finished in ${elapsedMs}ms (icons=${iconCount}, css=${builtCss ? 'ok' : 'skipped'}, js=${builtJs ? 'ok' : 'skipped'})`,
  );
}

function startWatchMode(paths: BuildPaths): void {
  const watchTargets = [
    resolve(paths.themeDir, 'assets/css'),
    resolve(paths.themeDir, 'assets/ts'),
    resolve(paths.themeDir, 'html'),
    paths.customIconsDir,
    paths.iconManifestPath,
  ];

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const triggerRebuild = (reason: string): void => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) {
        return;
      }
      running = true;
      console.log(`[strata] Change detected (${reason}), rebuilding...`);
      try {
        await runBuild({ paths, scope: 'full', target: 'dev' });
      } catch (error) {
        console.error('[strata] Rebuild failed:', error);
      } finally {
        running = false;
      }
    }, DEBOUNCE_MS);
  };

  for (const targetPath of watchTargets) {
    if (!existsSync(targetPath)) {
      continue;
    }
    const isDir = !targetPath.endsWith('.json');
    watch(targetPath, { recursive: isDir }, (_event, filename) => {
      triggerRebuild(filename ? String(filename) : targetPath);
    });
  }

  console.log('[strata] Watching assets/css, assets/ts, html, custom-icons, and icon-manifest.json...');
}

async function main(): Promise<void> {
  const args = new Set(Bun.argv.slice(2));
  const isWatch = args.has('--watch');
  const isIconsOnly = args.has('--icons-only');
  const target: BuildTarget = isWatch || process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
  const scope: BuildScope = isIconsOnly ? 'icons' : 'full';
  const paths = createBuildPaths();

  await runBuild({ paths, scope, target });

  if (isWatch) {
    startWatchMode(paths);
  }
}

await main();
