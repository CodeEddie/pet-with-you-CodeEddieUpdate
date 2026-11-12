const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const {douyinUrl}=require('./video-draft.cjs');

const exec=promisify(execFile);
const worker=[
  'import json, sys',
  'import douyin_http',
  'print(json.dumps(douyin_http._download_sync(sys.argv[1]), ensure_ascii=True))'
].join('\n');
let login;

function locations(dataDir){
  const tools=path.join(dataDir,'video-tools');
  const root=path.join(tools,'dsh-douyin-whale');
  return {
    root,
    python:path.join(root,'.venv','Scripts','python.exe'),
    data:path.join(root,'data'),
    downloader:path.join(tools,'yt-dlp.exe')
  };
}

async function workId(input,signal,fetcher=fetch){
  let url=new URL(douyinUrl(input));
  for(let hop=0;hop<4;hop++){
    const match=url.pathname.match(/^\/(?:share\/)?video\/(\d{15,22})\/?$/);
    if(match)return match[1];
    if(url.hostname!=='v.douyin.com')break;
    const timeout=AbortSignal.timeout(12000);
    const reply=await fetcher(url,{redirect:'manual',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    await reply.body?.cancel();
    const location=reply.headers.get('location');
    if(reply.status<300||reply.status>=400||!location)break;
    const target=new URL(location,url);
    if(target.protocol!=='https:'||target.username||target.password||target.port||
       !['v.douyin.com','www.douyin.com','douyin.com','www.iesdouyin.com'].includes(target.hostname))break;
    url=target;
  }
  throw new Error('没有从这个抖音链接识别到作品 ID。');
}

async function withWhaleVideo(link,{dataDir,signal,consume,onProgress=()=>{}}){
  onProgress("正在定位抖音作品");
  const id=await workId(link,signal);
  const app=locations(dataDir);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pet-whale-'));
  try{
    onProgress("正在通过抖音会话获取视频");
    let output;
    try{
      const {stdout}=await exec(app.python,['-c',worker,id],{
        cwd:path.join(app.root,'python'), windowsHide:true, signal, timeout:300000,maxBuffer:256*1024,
        env:{...process.env,PYTHONUTF8:'1',DOUYIN_DATA_DIR:app.data,DOUYIN_MEDIA_DIR:temp,
          DOUYIN_YTDLP:app.downloader,DOUYIN_IM_ALLOW_SEND:'0'}
      });
      output=JSON.parse(stdout.trim());
    }catch(error){
      signal.throwIfAborted();
      if(error.code==='ENOENT')throw new Error('抖音读取组件尚未安装完成。');
      throw new Error('开源读取组件未能完成视频下载，请检查网络或重新登录。');
    }
    if(!output.ok){
      const loginFile=path.join(app.data,'home','.dy','cookies','default.json');
      const loggedIn=await fs.stat(loginFile).then(stat=>stat.size>0,()=>false);
      const reason=String(output.error||'').includes('_ROUTER_DATA')?'抖音分享页没有返回视频数据。':'未能取得抖音视频文件。';
      throw new Error(reason+(loggedIn?'请确认测试账号能在抖音播放这条视频。':'请先点击「登录抖音会话」后重试。'));
    }
    const downloads=await fs.realpath(path.join(temp,'downloads'));
    const file=await fs.realpath(output.path);
    if(path.dirname(file)!==downloads||!new RegExp('^'+id+'\\.(mp4|m4v|mov|webm|mkv|avi)$','i').test(path.basename(file))){
      throw new Error('读取组件返回了无效的视频文件。');
    }
    return await consume(file);
  }finally{
    await fs.rm(temp,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
  }
}

async function openWhaleLogin(dataDir){
  if(login)return;
  const app=locations(dataDir);
  const child=spawn(app.python,[path.join(app.root,'tools','export_login_state.py')],{
    cwd:app.root, windowsHide:true, stdio:'ignore',env:{...process.env,PYTHONUTF8:'1'}
  });
  login=child;
  const clear=()=>{if(login===child)login=null;};
  child.once('exit',clear);
  try{
    await new Promise((resolve,reject)=>{
      child.once('spawn',resolve);
      child.once('error',reject);
    });
  }catch{
    clear();
    throw new Error('无法启动抖音登录窗口，请检查读取组件是否安装完成。');
  }
}

module.exports={workId,withWhaleVideo,openWhaleLogin};
