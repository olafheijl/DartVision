import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                app: fileURLToPath(new URL('./index.html', import.meta.url)),
                imageTest: fileURLToPath(new URL('./image-test.html', import.meta.url))
            }
        }
    }
});
