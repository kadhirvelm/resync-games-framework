"use client";

import clsx from "clsx";
import { DatabaseZap, Unplug } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/lib/copyText";
import { Button, Flex } from "@/lib/radix";
import styles from "./ProductNowConnection.module.scss";
import { useProductNowConnection } from "./ProductNowProvider";

interface ProductNowConnectionProps {
  /** `fixed` floats over the page. `inline` sits in the surrounding layout. */
  placement?: "fixed" | "inline";
}

/**
 * Connect/disconnect control for the browser's ProductNow session.
 * The connection itself is shared through {@link ProductNowProvider}.
 * @param placement - Where the control sits. Defaults to a fixed overlay
 * @returns A ProductNow connection button
 */
export const ProductNowConnection = ({
  placement = "fixed",
}: ProductNowConnectionProps) => {
  const { connect, connected, disconnect, errorMessage } =
    useProductNowConnection();
  const [errorCopied, setErrorCopied] = useState(false);

  let label = "Connect ProductNow";
  if (connected === null) {
    label = "Checking ProductNow";
  }
  if (connected === true) {
    label = "Disconnect ProductNow";
  }

  return (
    <Flex
      className={clsx(
        styles.connection,
        placement === "inline" && styles.inline,
      )}
      direction="column"
      gap="2"
    >
      <Button
        disabled={connected === null}
        onClick={() => {
          setErrorCopied(false);
          if (connected) {
            void disconnect();
            return;
          }
          connect();
        }}
        size="2"
      >
        {connected ? <Unplug size={16} /> : <DatabaseZap size={16} />}
        {label}
      </Button>
      {errorMessage && (
        <div className={styles.error}>
          <pre className={styles.errorText}>{errorMessage}</pre>
          <button
            className={styles.errorCopy}
            onClick={() => {
              void copyText(errorMessage).then((didCopy) => {
                if (didCopy) {
                  setErrorCopied(true);
                }
              });
            }}
            type="button"
          >
            {errorCopied ? "Copied" : "Copy error"}
          </button>
        </div>
      )}
    </Flex>
  );
};
