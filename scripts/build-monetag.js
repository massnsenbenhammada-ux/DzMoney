const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['public/monetag-adapter-entry.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: 'public/monetag-adapter.bundle.js',
  define: {
    'process.env.DOMAIN': JSON.stringify('libtl.com')
  }
}).catch((error) => {
  console.error('Monetag adapter build failed:', error);
  process.exit(1);
});
