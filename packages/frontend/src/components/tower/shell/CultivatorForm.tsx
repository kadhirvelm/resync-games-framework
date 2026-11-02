import {
  CULTIVATOR_APPEARANCE_MAX_LENGTH,
  CULTIVATOR_NAME_MAX_LENGTH,
  CULTIVATOR_TITLE_MAX_LENGTH,
  type CultivatorFields,
} from "@towers-of-coreborn/api";
import { useState } from "react";
import { playSound } from "../audio/sound";
import { Button } from "../parts/Button";
import styles from "./shell.module.scss";

/** Starting points offered under the appearance field. */
const APPEARANCE_IDEAS = [
  "A wiry herbalist in a patched indigo robe, ink-stained fingers, a gourd of medicine at the hip, hair tied with a jade pin.",
  "A broad-shouldered former blacksmith with a burn-scarred forearm, a leather apron over plain hemp, and a calm, heavy gaze.",
  "A young wandering scholar with ink-black hair, a bamboo scroll case on their back, and a faded crane embroidered on grey silk.",
];

/** One submit button under the form. */
export interface CultivatorFormAction {
  /** Turned off when the appearance is blank, for actions that paint */
  needsAppearance?: boolean;
  id: string;
  label: string;
  variant?: "primary" | "quiet";
}

interface CultivatorFormProps {
  actions: CultivatorFormAction[];
  busy: boolean;
  error?: string;
  initial: CultivatorFields;
  onSubmit: (fields: CultivatorFields, actionId: string) => void;
}

/**
 * Name, title, and appearance for a cultivator. The appearance is what the
 * portrait and battle sprite are painted from, so a few ideas sit under it.
 * @param actions - Submit buttons, first one primary
 * @param busy - Turns the buttons off while a request runs
 * @param error - Why the last submit failed
 * @param initial - Starting values
 * @param onSubmit - Called with the fields and the chosen action
 * @returns The form
 */
export const CultivatorForm = ({
  actions,
  busy,
  error,
  initial,
  onSubmit,
}: CultivatorFormProps) => {
  const [fields, setFields] = useState(initial);
  const hasName = fields.name.trim() !== "";
  const hasAppearance = fields.appearance.trim() !== "";

  /**
   * @param key - Field to change
   * @returns Change handler for that input
   */
  const edit =
    (key: keyof CultivatorFields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form
      className={styles.cultivatorForm}
      onSubmit={(event) => {
        event.preventDefault();
        const first = actions[0];
        const ready = hasName && (!first?.needsAppearance || hasAppearance);
        if (first && ready && !busy) {
          onSubmit(fields, first.id);
        }
      }}
    >
      <label className={styles.formField}>
        <span>Name</span>
        <input
          autoComplete="off"
          maxLength={CULTIVATOR_NAME_MAX_LENGTH}
          onChange={edit("name")}
          placeholder="Lin Wei"
          required={true}
          value={fields.name}
        />
      </label>
      <label className={styles.formField}>
        <span>Title</span>
        <input
          autoComplete="off"
          maxLength={CULTIVATOR_TITLE_MAX_LENGTH}
          onChange={edit("title")}
          placeholder="Walker of the Jade Path"
          value={fields.title}
        />
      </label>
      <label className={styles.formField}>
        <span>Appearance</span>
        <textarea
          maxLength={CULTIVATOR_APPEARANCE_MAX_LENGTH}
          onChange={edit("appearance")}
          placeholder="Who are they before the tower? Face, build, clothing, one thing they always carry."
          rows={4}
          value={fields.appearance}
        />
        <small>
          {fields.appearance.length}/{CULTIVATOR_APPEARANCE_MAX_LENGTH} · the
          portrait and battle sprite are painted from this
        </small>
      </label>
      {hasAppearance ? null : (
        <div className={styles.ideaRow}>
          <span>Ideas</span>
          {APPEARANCE_IDEAS.map((idea, index) => (
            <button
              className={styles.ideaChip}
              key={idea}
              onClick={() => {
                playSound("select");
                setFields((current) => ({ ...current, appearance: idea }));
              }}
              type="button"
            >
              {["Herbalist", "Smith", "Scholar"][index]}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.formActions}>
        {actions.map((action, index) => (
          <Button
            disabled={
              busy || !hasName || (action.needsAppearance && !hasAppearance)
            }
            key={action.id}
            onClick={
              index === 0 ? undefined : () => onSubmit(fields, action.id)
            }
            type={index === 0 ? "submit" : "button"}
            variant={action.variant ?? (index === 0 ? "primary" : "quiet")}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </form>
  );
};
