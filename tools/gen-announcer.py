#!/usr/bin/env python3
"""
Render the announcer callouts to small MP3 files with the free espeak-ng speech engine
(libespeak-ng, GPL data; the output audio is ours) and ffmpeg. Re-run to regenerate:

    python3 tools/gen-announcer.py

Output: public/voice/<id>.mp3 (served by Vite at /voice/)
"""
import ctypes, os, subprocess, sys, tempfile, wave

LINES = {
    'first-blood': 'First blood!',
    'double-kill': 'Double kill!',
    'triple-kill': 'Triple kill!',
    'quadra-kill': 'Quadra kill!',
    'penta-kill': 'Penta kill!',
    'ace': 'Ace!',
    'headshot': 'Headshot!',
}
VOICE = os.environ.get('VOICE', 'en-us+m3')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'voice')

lib = ctypes.CDLL('libespeak-ng.so.1')
SYNCH = 2
rate = lib.espeak_Initialize(SYNCH, 0, None, 0)
if rate <= 0:
    sys.exit('espeak-ng init failed')
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
buf = bytearray()

@CB
def on_audio(wav, n, _events):
    if n > 0:
        buf.extend(ctypes.string_at(wav, n * 2))
    return 0

lib.espeak_SetSynthCallback(on_audio)
lib.espeak_SetVoiceByName(VOICE.encode())
lib.espeak_SetParameter(1, 135, 0)  # rate (words/min): slow, deliberate
lib.espeak_SetParameter(3, 28, 0)   # base pitch: low
lib.espeak_SetParameter(4, 70, 0)   # pitch range: emphatic

os.makedirs(OUT, exist_ok=True)
# announcer treatment: deepen, warm EQ, compression, short slap-back room, normalise
FX = ('asetrate={r}*0.88,aresample=44100,atempo=1.08,highpass=f=70,'
      'equalizer=f=160:t=q:w=1:g=4,equalizer=f=2800:t=q:w=1.2:g=3,'
      'acompressor=threshold=-20dB:ratio=6:attack=3:release=120:makeup=4,'
      'aecho=0.8:0.5:45|90:0.25|0.12,volume=15dB,alimiter=limit=0.9:attack=2:release=60,'
      'apad=pad_dur=0.25')
for key, text in LINES.items():
    buf.clear()
    t = text.encode() + b'\0'
    lib.espeak_Synth(t, len(t), 0, 1, 0, 0, None, None)
    lib.espeak_Synchronize()
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        with wave.open(tmp.name, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(buf))
        dst = os.path.join(OUT, key + '.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-af', FX.format(r=rate), '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
        os.unlink(tmp.name)
    print(f'{key:12s} {os.path.getsize(dst):6d} B  "{text}"')
