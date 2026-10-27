import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	version: process.env.VSCODE_TEST_VERSION || '1.143.1',
	launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes'],
});
