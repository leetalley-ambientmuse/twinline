import { createServerFn } from "@tanstack/react-start";
import { parseArrangement, type CompiledTrack } from "@/lib/prompt/arrange";

export type ComposeResult = { ok: true; track: CompiledTrack } | { ok: false; error: string };

const SYSTEM = `You are the arranger for Twinline, a two-machine drum booth.
Amber is machine A, the foundation. Lacquer is machine B, the answer. They share a 16-step bar.
Reply with JSON only. No markdown.

Shape:
{
  "title": "short name",
  "blurb": "one sentence a player would understand",
  "bpm": 118,
  "a": { "role": "short role", "swing": 8, "kick": Voice, "snare": Voice, "hat": Voice, "perc": Voice },
  "b": { "role": "short role", "swing": 0, "kick": Voice, "snare": Voice, "hat": Voice, "perc": Voice },
  "mix": {
    "follow": false,
    "master": [78, 78],
    "cross": [48, 48],
    "aVol": [84, 84], "bVol": [70, 70],
    "aLow": [58, 58], "aMid": [50, 50], "aHigh": [48, 48], "aFilter": [50, 50],
    "bLow": [46, 46], "bMid": [50, 50], "bHigh": [58, 58], "bFilter": [50, 50]
  }
}
Voice is {"engine":"sample|fm|physical|granular","grid":"x---x---x---x---","mute":false,"a":50,"b":40,"c":50,"d":30,"e":20,"level":80}

Rules:
- grid is exactly 16 characters. x is a hit, - is a rest. Step 1 is the downbeat. Steps 5 and 13 are the backbeat.
- Do not clone Amber onto Lacquer unless the prompt asks for a double. Lacquer should answer, decorate, or leave space.
- Kick is usually 2 to 6 hits. Four on the floor is x---x---x---x---. Half-time is often x-------x-------. Never fill all 16 unless they ask for a roll.
- Hats can be denser. Perc stays sparse, 2 to 6 hits, and should not copy the snare.
- swing is 0 to 55. Shuffle, boom-bap, and jazz sit around 25 to 45. Techno and electro stay near 0.
- bpm is 70 to 180.
- Engines: sample = drum machine, 808, 909, dry. fm = electric, acid, metal, bell. physical = acoustic, wood, skin, cymbal. granular = dust, cloud, tail, glitch.
- Knobs are 0 to 100. a is pitch or tune, 50 is the middle. b is decay. c is tone, brightness, or FM ratio. d is attack. e is punch, noise, size, or spray. level is loudness. Kicks sit near 85 to 95. Hats sit near 35 to 55 so they do not bury the kick.
- Mix numbers are 0 to 100. cross 0 is all Amber, 100 is all Lacquer. Each pair is [start, end] across the bar.
- follow is true only when the prompt asks the mix, filter, or crossfader to move. Otherwise keep both pairs equal and follow false.
- If a voice should be absent, mute it and use a grid of 16 dashes.
- Stay playable. A person should want to loop it.`;

export const composeTrack = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => input)
  .handler(async ({ data }): Promise<ComposeResult> => {
    const prompt = typeof data?.prompt === "string" ? data.prompt.trim() : "";
    if (prompt.length < 3) return { ok: false, error: "Say a little more about the track." };
    if (prompt.length > 600) return { ok: false, error: "Keep the prompt under 600 characters." };

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "The wizard is not available right now." };

    let content = "";
    try {
      content = await ask(apiKey, prompt);
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        error: aborted ? "The wizard took too long. Try again." : "The wizard could not score that. Try again.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(content));
    } catch {
      return { ok: false, error: "The score came back unreadable. Try again." };
    }
    const arrangement = parseArrangement(parsed);
    if (!arrangement.ok) return arrangement;
    return { ok: true, track: arrangement.track };
  });

async function ask(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(55000),
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`score ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("empty score");
  return content;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : trimmed).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return body.slice(start, end + 1);
  return body;
}
