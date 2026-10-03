// Build-time adapter only. No loader downloads, Node shims or runtime compilation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const EXPECTED_SHA256='1a5c8f81186211856ba7c5d6841e35fe3fa901b857a247f72318e1652c5e1cec';
function adaptCompiledLoader(source){
 if(typeof source!=='string'||crypto.createHash('sha256').update(source).digest('hex')!==EXPECTED_SHA256)throw Error('Pinned lcms-wasm 1.0.5 loader changed; review adapter');
 const replacements=[
  ['var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;','var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER&&typeof Module["instantiateWasm"]!=="function";'],
  ['else{throw new Error("environment detection error")}','else if(typeof Module["instantiateWasm"]!=="function"){throw new Error("environment detection error")}']
 ];
 for(const [from,to] of replacements){if(source.split(from).length!==2)throw Error('Pinned compiled loader contract changed');source=source.replace(from,to);}
 return source;
}
function compiledColorLoaderPlugin(){return {name:'lcms-compiled-module-loader',setup(build){build.onLoad({filter:/lcms-wasm\/dist\/lcms\.js$/},args=>({contents:adaptCompiledLoader(fs.readFileSync(args.path,'utf8')),loader:'js',resolveDir:path.dirname(args.path)}));}};}
module.exports={adaptCompiledLoader,compiledColorLoaderPlugin,EXPECTED_SHA256};
