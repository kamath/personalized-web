import React from "react";
import type { Rule } from "../types";

interface Props {
  rules: Rule[];
  onDelete: (index: number) => void;
}

export default function SavedRules({ rules, onDelete }: Props) {
  return (
    <div className="saved-rules">
      <h2>Saved Rules</h2>
      {rules.length === 0 ? (
        <div className="empty-rules">No saved rules yet</div>
      ) : (
        rules.map((rule, i) => (
          <div className="rule-item" key={rule.createdAt}>
            <div className="rule-info">
              <div className="rule-pattern">{rule.urlPattern}</div>
              <div className="rule-prompt">{rule.prompt}</div>
            </div>
            <div className="rule-actions">
              <button onClick={() => onDelete(i)} title="Delete rule">
                &times;
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
