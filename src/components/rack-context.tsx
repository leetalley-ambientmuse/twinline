import { createContext, useContext } from "react";
import type { DeckId, VoiceId } from "@/lib/audio/model";

type RackApi = {
  arm: () => void;
  preview: (deck: DeckId, voice: VoiceId) => void;
  readLevel: () => number;
};

const RackContext = createContext<RackApi>({
  arm: () => {},
  preview: () => {},
  readLevel: () => 0,
});

export const RackProvider = RackContext.Provider;

export function useRack(): RackApi {
  return useContext(RackContext);
}
