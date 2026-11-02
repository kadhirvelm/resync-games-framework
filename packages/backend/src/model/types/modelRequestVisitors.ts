import { GenericType, VisitorPattern } from "@resync-game-framework/api";
import { ModelChatRequest, ModelRequest } from "./modelRequestTypes";

export interface AllProviders {
  anthropic: ModelRequest<"anthropic">;
  "open-ai": ModelRequest<"open-ai">;
  gemini: ModelRequest<"gemini">;
}

export type ValidProviderRequest = GenericType<AllProviders>;

export const AllProvidersRequestVisitor: VisitorPattern<AllProviders> = {
  typeChecks: {
    anthropic: (value) => value.type === "anthropic",
    gemini: (value) => value.type === "gemini",
    "open-ai": (value) => value.type === "open-ai",
  },
  visit: (value, visitor) => {
    if (AllProvidersRequestVisitor.typeChecks.anthropic(value)) {
      return visitor.anthropic(value);
    }

    if (AllProvidersRequestVisitor.typeChecks["open-ai"](value)) {
      return visitor["open-ai"](value);
    }

    if (AllProvidersRequestVisitor.typeChecks.gemini(value)) {
      return visitor.gemini(value);
    }

    return visitor.unknown(value);
  },
};

export interface AllChatProviders {
  anthropic: ModelChatRequest<"anthropic">;
  "open-ai": ModelChatRequest<"open-ai">;
  gemini: ModelChatRequest<"gemini">;
}

export type ValidChatProviderRequest = GenericType<AllChatProviders>;

export const AllChatProvidersRequestVisitor: VisitorPattern<AllChatProviders> =
  {
    typeChecks: {
      anthropic: (value) => value.type === "anthropic",
      gemini: (value) => value.type === "gemini",
      "open-ai": (value) => value.type === "open-ai",
    },
    visit: (value, visitor) => {
      if (AllChatProvidersRequestVisitor.typeChecks.anthropic(value)) {
        return visitor.anthropic(value);
      }

      if (AllChatProvidersRequestVisitor.typeChecks["open-ai"](value)) {
        return visitor["open-ai"](value);
      }

      if (AllChatProvidersRequestVisitor.typeChecks.gemini(value)) {
        return visitor.gemini(value);
      }

      return visitor.unknown(value);
    },
  };
