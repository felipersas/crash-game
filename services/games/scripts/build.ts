import { build, $ } from 'bun';

await $`rm -rf dist`;

// Packages that should always be externalized (optional deps with lazy requires)
const alwaysExternal = [
  '@nestjs/microservices',
  '@nestjs/websockets',
  '@nestjs/swagger',
  '@nestjs/mapped-types',
];

const optionalRequirePackages = [
  'class-transformer',
  'class-validator',
  '@fastify/static',
];

const result = await build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  target: 'bun',
  minify: {
    syntax: true,
    whitespace: true,
  },
  external: [
    ...alwaysExternal,
    ...optionalRequirePackages.filter((pkg) => {
      try {
        require(pkg);
        return false;
      } catch (_) {
        return true;
      }
    }),
  ],
  splitting: true,
});

if (!result.success) {
  console.log(result.logs[0]);
  process.exit(1);
}

console.log('Built successfully!');
