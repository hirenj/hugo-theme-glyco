// Secret neon mode, phase 5 (plans/secret-neon-mode.md): a synthesised,
// sample-free French-house loop. Not anyone's melody: a four-on-the-floor
// kick, off-beat hats, a filter-swept sawtooth chord stab, an arpeggiated
// bassline, sidechain-style pumping, and an arrangement that slowly
// evolves (the filter opens/closes and the hat pattern varies every 8
// bars, with a one-bar breakdown-then-drop every 16).
//
// start()/stop() are the only exports - secret-mode.js dynamically
// import()s this module on activation and calls start(), and calls
// stop() on deactivation. That dynamic import is what keeps this file
// (and Tone.js, ~100 KB gzipped) out of every normal page's bundle:
// webpack code-splits them into their own chunk, fetched only the first
// time secret mode actually activates on a given page load.

// Side-effect-only import: tone's package.json has no "exports" map, so
// webpack's web-target field priority (browser > module > main) resolves
// this to its UMD build (build/Tone.js) rather than the broken ESM one
// (whose own internal imports aren't extension-specified, which fails
// webpack's strict ESM resolution). That UMD wrapper can't detect a
// CommonJS environment inside webpack's bundle and falls through to its
// plain-global branch, attaching itself to `window.Tone` instead of
// `module.exports` - so this import is only here to make webpack bundle
// and execute it (before this file's own top-level code runs, since it's
// a direct dependency); the actual reference is read off the global
// immediately after.
import 'tone';
const Tone = window.Tone;

const BPM = 122;

let current = null;   // { stopPatch(), button } while running, else null

function makeDrumBus() {
    const crush = new Tone.BitCrusher(8).toDestination();
    crush.wet.value = 0.15;
    return new Tone.Gain(0.9).connect(crush);
}

// Builds the kick/hat/chord/bass patch and its slowly-evolving
// arrangement, and returns a function that tears all of it down. Cost:
// ~9 Web Audio nodes plus one Transport section callback firing once a
// bar - negligible CPU, nothing allocated per note (notes reuse the same
// synth instances throughout).
function buildPatch() {
    Tone.Transport.bpm.value = BPM;

    const drumBus = makeDrumBus();
    const pumpGain = new Tone.Gain(1).toDestination();

    const kick = new Tone.MembraneSynth({
        pitchDecay: 0.03, octaves: 6,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4 }
    }).connect(drumBus);
    kick.volume.value = -2;

    const hatFilter = new Tone.Filter(9000, 'highpass').connect(drumBus);
    const hat = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0 }
    }).connect(hatFilter);
    hat.volume.value = -8;

    const chordLFO = new Tone.LFO(0.12, 300, 2200).start();
    const chordFilter = new Tone.Filter(400, 'lowpass').connect(pumpGain);
    chordLFO.connect(chordFilter.frequency);

    const chordSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2 }
    }).connect(chordFilter);
    chordSynth.volume.value = -11;

    const bassFilter = new Tone.Filter(650, 'lowpass').connect(pumpGain);
    const bass = new Tone.MonoSynth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.1 },
        filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.2, baseFrequency: 100, octaves: 3 }
    }).connect(bassFilter);
    bass.volume.value = -5;

    const chords = [['D4', 'F4', 'A4', 'C5'], ['A3', 'C4', 'E4', 'G4']];
    const bassPattern = ['D2', 'D2', 'F2', 'D2', 'D2', 'D2', 'A2', 'G2'];

    let breakdown = false;   // true for one bar every 16 bars
    let hatBusy = false;     // alternates every 8 bars

    const kickLoop = new Tone.Loop((time) => {
        if (breakdown) return;
        kick.triggerAttackRelease('C1', '8n', time);
        pumpGain.gain.cancelScheduledValues(time);
        pumpGain.gain.setValueAtTime(0.25, time);
        pumpGain.gain.exponentialRampToValueAtTime(1, time + 0.22);
    }, '4n').start(0);

    let hatStep = 0;
    const hatLoop = new Tone.Loop((time) => {
        const onBeat = hatStep % 2 === 1;   // offbeat 8ths when not busy
        if (hatBusy || onBeat) hat.triggerAttackRelease('16n', time);
        hatStep++;
    }, '8n').start(0);

    let chordStep = 0;
    const chordLoop = new Tone.Loop((time) => {
        chordSynth.triggerAttackRelease(chords[chordStep % chords.length], '8n', time);
        chordStep++;
    }, '2n').start('4n');

    let bassStep = 0;
    const bassLoop = new Tone.Loop((time) => {
        if (!breakdown) bass.triggerAttackRelease(bassPattern[bassStep % bassPattern.length], '16n', time);
        bassStep++;
    }, '8n').start(0);

    let bar = 0;
    const sectionEvent = Tone.Transport.scheduleRepeat(() => {
        bar += 1;
        if (bar % 8 === 0) {
            hatBusy = !hatBusy;
            const opening = bar % 16 === 0;
            chordLFO.min = opening ? 500 : 300;
            chordLFO.max = opening ? 3200 : 2200;
        }
        if (bar % 16 === 1) {
            breakdown = true;
            Tone.Transport.scheduleOnce(() => { breakdown = false; }, '+1m');
        }
    }, '1m');

    const nodes = [drumBus, pumpGain, kick, hatFilter, hat, chordLFO, chordFilter,
        chordSynth, bassFilter, bass, kickLoop, hatLoop, chordLoop, bassLoop];

    Tone.Transport.start();

    return function stopPatch() {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.clear(sectionEvent);
        for (const n of nodes) n.dispose();
    };
}

// A small fixed mute button, in the theme's own neon colours (the CSS
// custom properties neon.css already sets on :root while this is up) -
// muting is a volume change only, the Transport keeps running, so
// un-muting picks the loop back up exactly where it left off. Remembered
// only for as long as secret mode stays on; leaving and re-entering
// always starts unmuted.
function addMuteButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Mute music';
    Object.assign(button.style, {
        position: 'fixed',
        right: '1em',
        bottom: '1em',
        zIndex: 2147483647,
        padding: '0.5em 0.9em',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #4a4458)',
        background: 'var(--surface-color, #211e2a)',
        color: 'var(--text-color, #e6e3ec)',
        font: '0.8rem var(--neon-font-family, sans-serif)',
        cursor: 'pointer',
    });
    let muted = false;
    button.addEventListener('click', () => {
        muted = !muted;
        Tone.Destination.mute = muted;
        button.textContent = muted ? 'Unmute music' : 'Mute music';
    });
    document.body.appendChild(button);
    return button;
}

export async function start() {
    if (current) return;
    // Unlocks the AudioContext - browsers suspend it until a user gesture
    // resumes it. secret-mode.js's dynamic import() is itself kicked off
    // from inside the Konami keydown handler, so this call still lands
    // within that gesture.
    await Tone.start();
    const stopPatch = buildPatch();
    const button = addMuteButton();
    current = { stopPatch, button };
}

export function stop() {
    if (!current) return;
    current.stopPatch();
    current.button.remove();
    current = null;
}
