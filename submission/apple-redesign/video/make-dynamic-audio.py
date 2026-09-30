"""Original upbeat 120 BPM score and synchronized sound effects. No speech or sampled media."""
from pathlib import Path
import wave,json
import numpy as np
r=Path(__file__).resolve().parent;o=r/'out/dynamic';o.mkdir(parents=True,exist_ok=True)
sr=48000;dur=48;N=sr*dur;beat=.5;rng=np.random.default_rng(93)
music=np.zeros((N,2));sfx=np.zeros((N,2))
def add(track,start,sig,pan=0,gain=1):
    pos=int(start*sr);skip=max(0,-pos);pos=max(0,pos);sig=sig[skip:];n=min(len(sig),N-pos)
    if n<=0:return
    track[pos:pos+n,0]+=sig[:n]*(.78-.25*pan)*gain
    track[pos:pos+n,1]+=sig[:n]*(.78+.25*pan)*gain

def tone(midi,duration,kind='pluck',amp=.1):
    t=np.arange(int(sr*duration))/sr;hz=440*2**((midi-69)/12)
    if kind=='pad':
        sig=sum(np.sin(2*np.pi*hz*(1+d)*t)*a for d,a in [(0,1),(.003,.3),(-.003,.3)])
        env=np.minimum(t/.09,1)*np.minimum((duration-t)/.4,1)
    elif kind=='bass':
        sig=np.sin(2*np.pi*hz*t)+.25*np.sin(2*np.pi*2*hz*t);env=(1-np.exp(-t*150))*np.exp(-t*5)
    elif kind=='bell':
        sig=np.sin(2*np.pi*hz*t)+.35*np.sin(2*np.pi*2*hz*t)+.1*np.sin(2*np.pi*3*hz*t);env=(1-np.exp(-t*220))*np.exp(-t*3)
    else:
        sig=np.sin(2*np.pi*hz*t)+.36*np.sin(2*np.pi*2*hz*t)+.17*np.sin(2*np.pi*3*hz*t);env=(1-np.exp(-t*250))*np.exp(-t*10)
    return sig*env*amp
chords=[[50,57,62,66],[45,52,57,61],[47,54,59,62],[43,50,55,59]]
for bar,start in enumerate(np.arange(0,dur,2)):
    ch=chords[bar%4]
    for j,m in enumerate(ch):add(music,start,tone(m+12,2.35,'pad',.029),(-1)**j*.7)
    for k in range(8):
        add(music,start+.25*k,tone(ch[[0,2,1,3,2,1,3,2][k]]+24,.5,'pluck',.075),np.sin(k*1.4)*.7)
        add(music,start+.25*k+.095,tone(ch[[0,2,1,3,2,1,3,2][k]]+24,.4,'pluck',.016),-np.sin(k*1.4)*.7)
    for k in range(4):
        add(music,start+.5*k,tone(ch[0]-12,.5,'bass',.16))
        t=np.arange(int(sr*.28))/sr
        kick=np.sin(2*np.pi*(47*t+3.2*(1-np.exp(-t*30))))*np.exp(-t*20)*.32
        add(music,start+.5*k,kick)
        if k%2==1:
            t=np.arange(int(sr*.14))/sr;noise=rng.normal(0,1,len(t));noise=np.diff(noise,prepend=0)
            clap=np.tanh(noise)*np.exp(-t*36)*(.4+.6*np.cos(t*90)**2)*.09
            add(music,start+.5*k,clap)
        for h in [0,.25]:
            t=np.arange(int(sr*.065))/sr;noise=rng.normal(0,1,len(t));noise=np.diff(noise,prepend=0)
            add(music,start+.5*k+h,np.tanh(noise)*np.exp(-t*85)*.032,(-1)**k*.4)
    if bar>=4:
        for k,idx in enumerate([3,2,1,2]):add(music,start+.5*k,tone(ch[idx]+24,.65,'bell',.024),.45)
# Transition swooshes: filtered noise sweeps and low impact. Never a clinical alarm.
events=[]
for second in range(4,48,4):
    length=.32;t=np.arange(int(sr*length))/sr;noise=rng.normal(0,1,len(t))
    smooth=np.convolve(noise,np.ones(12)/12,'same')
    env=np.sin(np.pi*t/length)**2
    sig=(smooth*.7+np.sin(2*np.pi*(400*t+1900*t*t))*.12)*env*.22
    add(sfx,second-.18,sig,.4 if second%8 else -.4)
    low=np.arange(int(sr*.17))/sr
    add(sfx,second,np.sin(2*np.pi*65*low)*np.exp(-low*26)*.1)
    events.append({'time':second,'type':'transition whoosh and soft impact'})
# Typing taps, field selection, readback accent and acknowledgment chimes.
for start in [8.4,12.4,20.9,29.1,32.5]:
    for k in range(4):
        t=np.arange(int(sr*.035))/sr;sig=np.sin(2*np.pi*(1800+200*k)*t)*np.exp(-t*200)*.065
        add(sfx,start+k*.13,sig,(-1)**k*.4)
    events.append({'time':start,'type':'interface taps'})
for start in [21.1,24.7,44.35]:
    for k,m in enumerate([74,78,81]):add(sfx,start+k*.075,tone(m,.75,'bell',.10),-.3+.3*k)
    events.append({'time':start,'type':'confirmation chime'})
# Rhythmic sidechain movement gives the original score an upbeat pulse.
t=np.arange(N)/sr;duck=.64+.36*np.minimum((t%.5)/.18,1)
fade=np.clip(t/.18,0,1)*np.clip((dur-t)/1.1,0,1)
music*=duck[:,None]*fade[:,None];sfx*=fade[:,None]
def write(name,a):
    with wave.open(str(o/name),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((np.clip(a,-.99,.99)*32767).astype('<i2').tobytes())
mix=music+sfx;gain=.82/max(np.max(np.abs(mix)),.01)
write('music-only.wav',music*gain);write('sound-effects-only.wav',sfx*gain);write('music-and-sfx.wav',mix*gain)
(r/'dynamic-audio-manifest.json').write_text(json.dumps({'duration':dur,'bpm':120,'narration':False,'source':'Original procedural synthesis; no sampled media','events':events},indent=2)+'\n')
print(json.dumps({'duration':dur,'sample_rate':sr,'peak':float(np.max(np.abs(mix*gain))),'narration':False,'sound_effect_events':len(events)}))
