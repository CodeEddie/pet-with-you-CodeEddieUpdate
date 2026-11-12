const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');

const exec = promisify(execFile);
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_SECONDS = 3600;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;
const FORMATS = 'mov,matroska,webm,avi';
const LINK_ERROR = '这个抖音链接暂时读不到字幕或视频。请拖入已保存的视频文件。';

function douyinUrl(input) {
  for (const match of String(input ?? '').matchAll(/https:\/\/[^\s<>"，。！？、）】]+/gi)) {
    const url = new URL(match[0]);
    if (['douyin.com','www.douyin.com','v.douyin.com'].includes(url.hostname) &&
        !url.username && !url.password && !url.port) return url.href;
  }
  throw new Error('请粘贴抖音分享链接，或拖入本地视频文件。');
}

function shareDescription(input) {
  const value = String(input ?? "");
  const match = value.match(/https:\/\/(?:v\.|www\.)?douyin\.com\/[^\s<>"，。！？、）】]+/i);
  if (!match) return "";
  return value.slice(0,match.index).trim()
    .replace(/^\d+(?:\.\d+)?\s+\S+:\/\s+(?::?\d+(?::\d+)?(?:am|pm)\s+)?\d{1,2}\/\d{1,2}\s+\S+@\S+\s+/i,"")
    .trim().slice(0,2000);
}

function subtitleText(value) {
  const lines = value.replace(/^\uFEFF/, '').split(/\r?\n/);
  const result = [];
  let cue = false;
  for (const line of lines) {
    if (line.includes(' --> ')) {
      cue = true;
      continue;
    }
    if (!line.trim()) cue = false;
    if (!cue) continue;
    const clean = line.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|nbsp);/g, (_, code) => ({amp:'&',lt:'<',gt:'>',nbsp:' '})[code]).trim();
    if (clean && result.at(-1) !== clean) result.push(clean);
  }
  return result.join('\n');
}

function evidenceLabel(words, images) {
  return '基于' + (words && images ? words + '和画面' : words || '画面');
}

async function executable(dir, candidates) {
  for (const name of candidates) {
    const file = path.join(dir, name);
    const info = await fs.stat(file).catch(() => null);
    if (info?.isFile() && info.size > 0) return file;
  }
}

async function prepareVideo(input, {dataDir, signal, generate, onProgress=()=>{}}) {
  const tools = path.join(dataDir, 'video-tools');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-video-'));
  const run = (file, args, timeout) => exec(file, args, {windowsHide:true, timeout, signal, maxBuffer:2*1024*1024});
  const attempt = async (file, args, timeout) => {
    try { return await run(file, args, timeout); }
    catch { signal.throwIfAborted(); return null; }
  };
  try {
    const ffmpeg = await executable(tools, ['ffmpeg.exe','codec/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe']);
    const ffprobe = await executable(tools, ['ffprobe.exe','codec/node_modules/@ffprobe-installer/win32-x64/ffprobe.exe']);
    let file, transcript = '', words = '', linkFailure = LINK_ERROR;
    if (input.file) {
      if (typeof input.file !== 'string' || !/^[a-z]:[\\/]/i.test(input.file) || !VIDEO_EXT.test(input.file)) {
        throw new Error('请选择本机的 MP4、MOV、WebM、MKV 或 AVI 视频。');
      }
      file = await fs.realpath(input.file).catch(() => null);
      if (!file || !/^[a-z]:[\\/]/i.test(file) || !VIDEO_EXT.test(file)) throw new Error('无法读取这个本地视频文件。');
    } else {
      onProgress("正在从分享链接读取视频和字幕");
      const url = douyinUrl(input.link);
      const downloader = await executable(tools, ['yt-dlp.exe']);
      if (!downloader) throw new Error('缺少抖音链接读取组件。请拖入本地视频文件。');
      try {
        await run(downloader, ['--ignore-config','--no-playlist','--no-part','--no-mtime','--no-cache-dir',
        '--socket-timeout','12','--retries','1','--no-progress','--max-filesize','512M',
        '--write-subs','--write-auto-subs','--sub-langs','zh.*,en.*','--sub-format','vtt/srt',
        '-f','best[ext=mp4]/best[ext=webm]/best','-o',path.join(temp,'source.%(ext)s'),'--',url], 120000);
      } catch (error) {
        signal.throwIfAborted();
        if (/HTTP Error 403|Fresh cookies/i.test(error.stderr || "")) {
          linkFailure = "抖音拒绝了视频详情请求（403），桌宠未拿到视频或字幕。请拖入本地视频，或使用分享文案出稿。";
        }
      }
      const items = await fs.readdir(temp);
      const captions = items.filter(name => /^source\..+\.(vtt|srt)$/i.test(name));
      const subtitle = captions.find(name => /^source\.zh/i.test(name)) || captions[0];
      if (subtitle) {
        const captionPath = path.join(temp,subtitle);
        if ((await fs.stat(captionPath)).size <= 2*1024*1024) transcript = subtitleText(await fs.readFile(captionPath,'utf8'));
        if (transcript) words = '字幕';
      }
      const media = items.find(name => /^source\.[^.]+$/.test(name) && VIDEO_EXT.test(name));
      if (media) file = path.join(temp,media);
      if (!file && !transcript) throw Object.assign(new Error(linkFailure),{linkUnavailable:true});
    }

    const images = [];
    if (file) {
      onProgress("正在检查视频和字幕");
      const stat = await fs.stat(file).catch(() => null);
      if (!stat?.isFile() || !stat.size) throw new Error(input.file ? '无法读取这个本地视频文件。' : LINK_ERROR);
      if (stat.size > MAX_BYTES) throw new Error('视频超过 512 MB，请先压缩或截取相关片段。');
      if ((!ffmpeg || !ffprobe) && !transcript) throw new Error('缺少 FFmpeg 视频处理组件。');
      if (ffmpeg && ffprobe) {
        const probe = await attempt(ffprobe, ['-v','error','-protocol_whitelist','file','-format_whitelist',FORMATS,
          '-show_entries','format=duration:stream=codec_type,codec_name','-of','json','-i',file], 15000);
        const meta = probe ? JSON.parse(probe.stdout) : {};
        const duration = Number(meta.format?.duration);
        if (!transcript && !(duration > 0)) throw new Error(input.file ? '这个文件无法解码，请换一个常见格式的视频。' : LINK_ERROR);
        if (duration > MAX_SECONDS) throw new Error('视频超过 60 分钟，请先截取相关片段。');
        const decode = ['-nostdin','-v','error','-protocol_whitelist','file','-format_whitelist',FORMATS];
        const streams = meta.streams || [];
        if (!transcript && streams.some(stream => stream.codec_type === 'subtitle')) {
          const captions = path.join(temp,'embedded.srt');
          if (await attempt(ffmpeg,[...decode,'-i',file,'-map','0:s:0','-c:s','srt',captions],30000)) {
            transcript = subtitleText(await fs.readFile(captions,'utf8'));
            if (transcript) words = '字幕';
          }
        }
        let speechUnavailable = false;
        if (!transcript && streams.some(stream => stream.codec_type === 'audio')) {
          const whisper = await executable(tools,['whisper/Release/whisper-cli.exe']);
          const model = await executable(tools,['ggml-base.bin']);
          speechUnavailable = !whisper || !model;
          if (!speechUnavailable) {
            onProgress("正在转录音频（视频约 "+Math.ceil(duration/60)+" 分钟）");
            const wav = path.join(temp,'audio.wav');
            const output = path.join(temp,'transcript');
            const extracted = await attempt(ffmpeg,[...decode,'-i',file,'-vn','-map','0:a:0','-ac','1','-ar','16000','-c:a','pcm_s16le',wav],90000);
            if (extracted && await attempt(whisper,['-m',model,'-f',wav,'-l','auto','-t','6','-otxt','-of',output,'-nt','-np','-ng'],720000)) {
              transcript = (await fs.readFile(output+'.txt','utf8')).trim();
              if (transcript) words = '音频转录';
            } else {
              speechUnavailable = true;
            }
          }
        }
        if (duration > 0 && streams.some(stream => stream.codec_type === 'video')) {
          const count = Math.min(10,Math.max(2,Math.ceil(duration/12)));
          for (let i=0;i<count;i++) {
            onProgress("正在提取画面 "+(i+1)+"/"+count);
            const second = duration * (i+0.5)/count;
            const frame = path.join(temp,'frame-'+i+'.jpg');
            if (await attempt(ffmpeg,[...decode,'-ss',second.toFixed(3),'-i',file,'-map','0:v:0','-frames:v','1',
              '-vf',"scale='min(512,iw)':-2",'-q:v','4',frame],12000) && (await fs.stat(frame).catch(()=>null))?.size) {
              images.push({path:frame,second:Math.round(second)});
            }
          }
        }
        if (speechUnavailable && !images.length && !transcript) throw new Error('音频转录未完成。请改用带字幕的视频，或粘贴文字素材。');
      }
    }
    if (!transcript && !images.length) throw new Error(input.file ? '未从视频提取到可用字幕、语音或画面。' : LINK_ERROR);
    signal.throwIfAborted();
    const text = transcript.length <= 24000 ? transcript :
      transcript.slice(0,8000)+'\n[中间节选]\n'+transcript.slice(transcript.length/2-4000,transcript.length/2+4000)+'\n[结尾节选]\n'+transcript.slice(-8000);
    return await generate({text,words,images});
  } finally {
    await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});
  }
}

module.exports = {douyinUrl,shareDescription,subtitleText,evidenceLabel,prepareVideo};
