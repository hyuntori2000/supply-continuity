import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {resolveConfig} from './src/api/client';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 resolveConfig(env);
 return {
  plugins:[react()],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  css:{postcss:{plugins:[]}},
  build:{outDir:'dist',sourcemap:false},
  // Local integration only. Production uses VITE_API_BASE_URL and backend CORS.
  server:{proxy:env.DEV_API_PROXY?{'/api':{target:env.DEV_API_PROXY,changeOrigin:true,configure(proxy){proxy.on('proxyReq',req=>req.setHeader('origin',new URL(env.DEV_API_PROXY).origin));}}}:undefined},
 };
});
