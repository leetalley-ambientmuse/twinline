import { createContext, useContext } from "react";
import type { DeckId, VoiceId } from "@/lib/audio/model";

type RackApi = {
  arm: () => void;
  preview: (deck: DeckId, voice: VoiceId) => void;
  readLevel: () => number;
  bounce: (bars: number) => Promise<Blob | null>;
};

const RackContext = createContext<RackApi>({
  arm: () => {},
  preview: () => {},
  readLevel: () => 0,
  bounce: async () => null,
});

export const RackProvider = RackContext.Provider;

export function useRack(): RackApi {
  return useContext(RackContext);
}
