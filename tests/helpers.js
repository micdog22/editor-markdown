// Utilitário dos testes: cada caso é [entrada, HTML esperado, opções extras].
import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../src/markdown.js';

export function runCases(group, cases, options = {}) {
  cases.forEach(([input, expected, extra], i) => {
    const label = JSON.stringify(input).slice(0, 60);
    test(`${group} ${i + 1}: ${label}`, () => {
      assert.equal(markdownToHtml(input, { ...options, ...extra }), expected);
    });
  });
}
