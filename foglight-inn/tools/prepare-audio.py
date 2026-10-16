"""Authoring only: edit CC0 recordings and synthesize modest event Foley.
Usage: python prepare-audio.py [--deps <directory containing soundfile>]
"""
import sys, pathlib, json, hashlib
if '--deps' in sys.argv:
    sys.path.insert(0, sys.argv[sys.argv.index('--deps')+1])
import numpy as np
import soundfile as sf
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'media'/'audio'
RATE=22050
rng=np.random.default_rng(14731)
manifest=[]
def load(name):
    a,r=sf.read(OUT/'sources'/name,always_2d=True);a=a.mean(axis=1)
    return np.interp(np.arange(int(len(a)*RATE/r))/RATE,np.arange(len(a))/r,a)
def normalize(a,peak=.45):
    a=a-np.mean(a);m=np.max(np.abs(a));return a*(peak/max(m,1e-9))
def loop(a,seconds):
    length=int(seconds*RATE);fade=min(int(.4*RATE),len(a)//8)
    a=np.tile(a,int(np.ceil((length+fade)/len(a))))[:length+fade]
    # Tail -> head crossfade removes the discontinuity without a silent gap.
    w=np.linspace(0,1,fade);a[:fade]=a[-fade:]*(1-w)+a[:fade]*w
    a=a[:length];a[-1]=a[0];return a
def save(id,a,source,author,license,edits,use,looping=False):
    a=np.asarray(a,dtype=float);a=np.clip(a,-.98,.98)
    if not looping:
        n=min(int(.008*RATE),len(a)//4);a[:n]*=np.linspace(0,1,n);a[-n:]*=np.linspace(1,0,n)
    file=OUT/(id+'.wav');sf.write(file,a,RATE,subtype='PCM_16')
    manifest.append(dict(asset=id,file='media/audio/'+file.name,source=source,author=author,license=license,edits=edits,use=use,loop=looping,duration=round(len(a)/RATE,3),peak=round(float(np.max(np.abs(a))),5),rms=round(float(np.sqrt(np.mean(a*a))),5),seam=round(float(abs(a[-1]-a[0])),6),sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
rain=load('rain.ogg');sea=load('ocean.flac');fire=load('fire.wav')
rain_source='https://opengameart.org/node/22231'
sea_source='https://opengameart.org/content/beach-ocean-waves'
fire_source='https://opengameart.org/content/fire-crackling'
indoor=np.convolve(rain,np.ones(9)/9,mode='same')
save('rain-indoor',normalize(loop(indoor,20),.34),rain_source,'kindland','CC0-1.0','mono 22050 Hz; low-pass; 400 ms overlap; normalized','室内窗上雨声',True)
save('sea-wind',normalize(loop(sea,20),.42),sea_source,'jasinski; submitted by qubodup','CC0-1.0','mono 22050 Hz; 400 ms overlap; normalized','室外海风与远浪',True)
save('storm',normalize(loop(np.tanh(rain*1.7),20),.48),rain_source,'kindland','CC0-1.0','mono 22050 Hz; gentle peak compression; 400 ms overlap','风雨加重',True)
save('fire',normalize(loop(fire,8),.35),fire_source,'AntumDeluge','CC0-1.0','mono 22050 Hz; 400 ms overlap; normalized','公共厅炉火近景',True)
def t(sec):return np.arange(int(sec*RATE))/RATE
def noise(sec):return rng.standard_normal(int(sec*RATE))
def tone(sec,hz,decay=5):
    x=t(sec);return np.sin(2*np.pi*hz*x)*np.exp(-decay*x)
def knock(sec=.18,hz=150):return normalize(tone(sec,hz,30)+.1*noise(sec)*np.exp(-35*t(sec)),.3)
def seq(parts,gap=.1):
    return np.concatenate([np.concatenate((a,np.zeros(int(gap*RATE)))) for a in parts])
own=('tools/prepare-audio.py','Foglight Inn production','CC0-1.0','deterministic original synthesis; short fades')
x=t(8);save('generator',normalize((np.sin(2*np.pi*50*x)+.25*np.sin(2*np.pi*100*x))*(.8+.04*np.sin(2*np.pi*3*x)),.24),*own,'灯塔正常发电机',True)
save('radio-hum',normalize(loop(np.convolve(noise(8),np.ones(3)/3,mode='same'),8),.12),*own,'现用报务台低底噪',True)
save('bell',normalize(tone(.8,780,6)+.4*tone(.8,1170,7),.38),*own,'门铃')
save('door',normalize(tone(.45,95,13)+.16*noise(.45)*np.exp(-10*t(.45)),.30),*own,'门合拢')
save('steps',seq([knock(.12,120),knock(.12,145),knock(.12,125)],.15),*own,'木地板脚步')
save('paper',normalize(noise(.45)*np.sin(np.pi*t(.45)/.45)**2,.22),*own,'钥匙与纸张轻响')
save('tools',normalize(seq([tone(.22,1100,22),tone(.18,850,25)],.06),.32),*own,'检修工具')
save('bowl',normalize(tone(.4,1500,18)+.32*tone(.4,2300,20),.25),*own,'杯碗放下')
save('radio-switch',knock(.10,350),*own,'现用报务台开关')
save('tune',normalize(noise(.9)*(.1+.9*np.sin(2*np.pi*3*t(.9))**2),.20),*own,'现用报务台调谐')
save('signal',normalize(seq([tone(.16,720,8),tone(.24,620,7)],.12),.25),*own,'岸台已收信号')
x=t(1.3);save('horn',normalize((np.sin(2*np.pi*180*x)+.4*np.sin(2*np.pi*270*x))*np.sin(np.pi*x/1.3)**2,.34),*own,'已确认船务后的远船笛')
save('confirm',knock(.09,460)*.5,*own,'轻确认反馈')
save('unavailable',seq([knock(.08,230),knock(.06,190)],.03)*.4,*own,'轻不可执行反馈')
x=t(1.6);save('old-call',normalize(noise(1.6)*(.03+.12*np.sin(2*np.pi*4*x)**2)+.1*np.sin(2*np.pi*510*x)*np.exp(-2*x),.18),*own,'退役机呼号表现；正文同步显示完整字幕，无配音')
(OUT/'sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(files=len(manifest),maxPeak=max(m['peak'] for m in manifest),loops=[dict(asset=m['asset'],seconds=m['duration'],seam=m['seam']) for m in manifest if m['loop']]),ensure_ascii=False))
