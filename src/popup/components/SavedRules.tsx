import React from "react";
import { Rule } from "../types";
import { escapeHtml } from "../utils";

interface SavedRulesProps {
  rules: Rule[];
  onDeleteRule: (index: number) => void;
}

export function SavedRules({ rules, onDeleteRule }: SavedRulesProps) {
  return (
    <div className="saved-rules">
      <h2>Saved Rules</h2>
      <div id="rulesList">
        {rules.length === 0 ? (
          <div className="empty-rules">No saved rules yet</div>
        ) : (
          rules.map((rule, index) => (
            <div key={index} className="rule-item">
              <div className="rule-info">
                <div className="rule-pattern">{escapeHtml(rule.urlPattern)}</div>
                <div className="rule-prompt">{escapeHtml(rule.prompt)}</div>
              </div>
              <div className="rule-actions">
                <button
                  onClick={() => onDeleteRule(index)}
                  title="Delete rule"
                >
                  &times;
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
