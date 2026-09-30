"""Original procedural score and local macOS narration; no external audio assets."""
from pathlib import Path
import json, subprocess, wave
import numpy as np
root=Path(__file__).resolve().parent
out=root/'out'; out.mkdir(exist_ok=True)
sr=48000; duration=72; music=np.zeros((sr*duration,2),np.float64); voice=np.zeros(sr*duration,np.float64)
rng=np.random.default_rng(17)
script=[
(0.8,'A handoff can change with just one word. Pending becomes clear. The next person walks away with a different understanding.'),
(8.6,'Meet CareThread. A voice-guided workspace for practicing clinical handoffs, with responsibility intact.'),
(16.6,'Capture the unfinished work. Keep uncertainty visible. When an owner or time is missing, ask for clarification instead of filling in the gap.'),
(27.6,'A changed readback needs a pause. The sender clarifies: Doctor Lee owns the review by three p.m. The result is still pending.'),
(37.7,'The receiver acknowledges the plan. But accepting responsibility does not complete the work. CareThread keeps those two events separate, with source statements attached.'),
(48.6,'Assembly A I powers speech and structured planning. Application rules check sources, roles, and revisions. Eighty automated checks and one synthetic spoken fixture have passed.'),
(61.6,'Built for handoff practice with clinical educators. CareThread. The next person knows what is still unfinished.')]
(root/'narration.json').write_text(json.dumps([{'start':s,'text':t} for s,t in script],indent=2))
for i,(start,text) in enumerate(script):
    aiff=out/f'voice-{i}.aiff'; wav=out/f'voice-{i}.wav'
    subprocess.run(['say','-v','Samantha','-r','173','-o',str(aiff),text],check=True)
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(aiff),'-ar',str(sr),'-ac','1','-c:a','pcm_s16le',str(wav)],check=True)
    with wave.open(str(wav),'rb') as w: a=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(float)/32768
    if len(a)<sr: raise RuntimeError("Local speech synthesis returned empty audio; allow access to the macOS speech service.")
    end=int(start*sr)+len(a)
    next_start=script[i+1][0] if i+1<len(script) else duration-.5
    if end/sr>next_start: raise RuntimeError(f'Voice segment {i} exceeds scene: {end/sr}')
    voice[int(start*sr):end]+=a
    print(f'Voice {i}: {len(a)/sr:.2f}s')
beat=60/104
chords=[[50,57,62,66],[47,54,59,62],[43,50,55,59],[45,52,57,61]]
def add(start, signal, pan=0):
    n=int(start*sr); limit=min(len(signal),len(music)-n)
    if limit<=0:return
    music[n:n+limit,0]+=signal[:limit]*(.72-.24*pan)
    music[n:n+limit,1]+=signal[:limit]*(.72+.24*pan)
def note(midi,length,kind,amp):
    t=np.arange(int(length*sr))/sr; f=440*2**((midi-69)/12)
    if kind=='pad':
        sig=(np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*f*1.002*t)+.14*np.sin(2*np.pi*2*f*t))
        env=np.minimum(t/.4,1)*np.minimum((length-t)/.8,1)
    else:
        sig=np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*2*f*t)+.12*np.sin(2*np.pi*3*f*t)
        env=(1-np.exp(-t*160))*np.exp(-t*(3.3 if kind=='pluck' else 2.2))
    return sig*env*amp
for bar,start in enumerate(np.arange(0,duration,beat*4)):
    chord=chords[(bar//2)%4]
    for j,m in enumerate(chord):add(start,note(m+12,beat*4+.8,'pad',.022),(-1)**j*.6)
    add(start,note(chord[0]-12,beat*3.8,'bass',.045))
    for k in range(8):
        add(start+k*beat/2,note(chord[[0,1,2,3,2,1,3,2][k]]+24,1.25,'pluck',.03),(-1)**k*.65)
    for k in range(4):
        t=np.arange(int(.22*sr))/sr
        kick=np.sin(2*np.pi*(48*t+5*(1-np.exp(-t*25))))*np.exp(-t*24)*.06
        add(start+k*beat,kick)
        if k%2:
            t=np.arange(int(.09*sr))/sr; noise=rng.normal(0,1,len(t)); hi=np.diff(noise,prepend=0)
            add(start+k*beat,hi*np.exp(-t*48)*.005)
# Speech-aware music ducking, gentle entry and exit.
activity=np.convolve((np.abs(voice[::480])>.02).astype(float),np.ones(35)/35,'same')
duck=1-.5*np.interp(np.arange(len(voice)),np.arange(len(activity))*480,activity)
t=np.arange(len(voice))/sr
fade=np.clip(t/3,0,1)*np.clip((duration-t)/3,0,1)
voice=voice/(max(np.max(np.abs(voice)),.01))*.68
mix=(music*duck[:,None]*fade[:,None])+voice[:,None]
peak=np.max(np.abs(mix))
if peak>.94: mix*=.94/peak
with wave.open(str(out/'carethread-soundtrack.wav'),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((mix*32767).astype('<i2').tobytes())
print('Wrote 72s original score and local narration. Peak:',float(np.max(np.abs(mix))))
