// @ts-ignore
const originalInstantiate = WebAssembly.instantiate;
// @ts-ignore
WebAssembly.instantiate = (function (moduleOrBuffer, importObject) {
  let target = moduleOrBuffer;
  if (target && typeof target === 'object' && 'default' in target) {
    target = target.default;
  }

  const isModule = target instanceof WebAssembly.Module ||
    (target && Object.prototype.toString.call(target) === '[object WebAssembly.Module]') ||
    (target && typeof target === 'object' && target.constructor && target.constructor.name === 'Module');

  if (isModule) {
    try {
      const instance = new WebAssembly.Instance(target, importObject);
      // Ensure we return the object shape that resvg/yoga expect when resolving instantiated bytes
      return Promise.resolve({ instance, module: target });
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return originalInstantiate(target, importObject);
} as any);

import satori, { init as initSatori } from 'satori/standalone';
import initYoga from 'yoga-wasm-web';
// @ts-ignore
import yogaWasmRaw from 'yoga-wasm-web/dist/yoga.wasm';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-ignore
import wasmModuleRaw from '@resvg/resvg-wasm/index_bg.wasm';
import { logoBase64 } from './logo';

const yogaWasm = (yogaWasmRaw as any).default || yogaWasmRaw;
const wasmModule = (wasmModuleRaw as any).default || wasmModuleRaw;

let wasmInitialized = false;
let fontData: ArrayBuffer | null = null;

async function init() {
  if (!wasmInitialized) {
    console.log("typeof wasmModule", typeof wasmModule);
    console.log("wasmModule", wasmModule);
    console.log("wasmModule instanceof WebAssembly.Module", wasmModule instanceof WebAssembly.Module);

    console.log("typeof yogaWasm", typeof yogaWasm);
    console.log("yogaWasm", yogaWasm);
    console.log("yogaWasm instanceof WebAssembly.Module", yogaWasm instanceof WebAssembly.Module);

    try {
      await initWasm(wasmModule);
    } catch (e: any) {
      throw new Error(`[WASM ERROR] wasmModule type: ${typeof wasmModule}, toString: ${Object.prototype.toString.call(wasmModule)}, isWasmModule: ${wasmModule instanceof WebAssembly.Module}. Error: ${e.message}`);
    }

    try {
      const yoga = await initYoga(yogaWasm);
      initSatori(yoga);
    } catch (e: any) {
      throw new Error(`[YOGA ERROR] yogaWasm type: ${typeof yogaWasm}, toString: ${Object.prototype.toString.call(yogaWasm)}, isWasmModule: ${yogaWasm instanceof WebAssembly.Module}. Error: ${e.message}`);
    }

    wasmInitialized = true;
  }
  if (!fontData) {
    const res = await fetch('https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf');
    fontData = await res.arrayBuffer();
  }
}

export async function generateGroupStandingsImage(groupName: string, teams: any[]): Promise<Uint8Array> {
  await init();

  // Sort teams
  teams.sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for);

  const html = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '900px',
        height: '600px',
        backgroundColor: '#f5f5f5',
        fontFamily: 'Roboto',
        padding: '40px',
        boxSizing: 'border-box'
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', position: 'absolute', top: '20px', left: '20px' },
            children: [
              {
                type: 'img',
                props: { src: logoBase64, width: 150, height: 180, style: { objectFit: 'contain' } }
              }
            ]
          }
        },
        {
          type: 'div',
          props: {
            style: { 
              display: 'flex', 
              flexDirection: 'column', 
              width: '700px', 
              marginLeft: 'auto',
              marginRight: '20px',
              marginTop: '80px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0', 
              borderRadius: '12px', 
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            },
            children: [
              // Header
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', fontSize: '24px', color: '#64748b' },
                  children: [
                    { type: 'span', props: { style: { flex: 1, fontWeight: 'normal', color: '#1e293b' }, children: `Group ${groupName}` } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: 'P' } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: 'W' } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: 'D' } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: 'L' } },
                    { type: 'span', props: { style: { width: '50px', textAlign: 'center' }, children: 'GD' } },
                    { type: 'span', props: { style: { width: '50px', textAlign: 'center', fontWeight: 'bold' }, children: 'Pts' } },
                  ]
                }
              },
              // Rows
              ...teams.map((t, i) => ({
                type: 'div',
                props: {
                  style: {
                    display: 'flex', padding: '16px 24px', fontSize: '24px',
                    borderTop: i === 0 ? 'none' : '1px solid #e2e8f0', alignItems: 'center', color: '#1e293b'
                  },
                  children: [
                    { type: 'span', props: { style: { width: '30px', color: '#0f172a' }, children: String(i + 1) } },
                    { type: 'span', props: { style: { flex: 1, display: 'flex', alignItems: 'center' }, children: `${t.flag_icon || ''}  ${t.team_name}` } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: String(t.played) } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: String(t.wins) } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: String(t.draws) } },
                    { type: 'span', props: { style: { width: '40px', textAlign: 'center' }, children: String(t.losses) } },
                    { type: 'span', props: { style: { width: '50px', textAlign: 'center' }, children: String(t.goal_difference) } },
                    { type: 'span', props: { style: { width: '50px', textAlign: 'center', fontWeight: 'bold' }, children: String(t.points) } },
                  ]
                }
              }))
            ]
          }
        }
      ]
    }
  };

  const svg = await satori(html as any, {
    width: 900,
    height: 600,
    fonts: [{ name: 'Roboto', data: fontData!, weight: 400, style: 'normal' }]
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 900 } });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  return pngBuffer;
}
