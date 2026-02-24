/**
 * MD to Print — Editor Module
 *
 * Sets up CodeMirror 6 with Markdown language support in the #editor-container.
 */
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

// Catppuccin Mocha-inspired dark theme for the editor
const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#1e1e2e",
    color: "#cdd6f4",
  },
  ".cm-content": {
    caretColor: "#89b4fa",
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#89b4fa",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#45475a",
  },
  ".cm-activeLine": {
    backgroundColor: "#181825",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#181825",
  },
  ".cm-gutters": {
    backgroundColor: "#181825",
    color: "#6c7086",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "#313244",
    color: "#a6adc8",
    border: "none",
  },
}, { dark: true });

/**
 * Initialize the CodeMirror 6 editor.
 * @param {HTMLElement} container - The DOM element to attach the editor to.
 * @param {string} initialDoc - Initial Markdown content.
 * @param {function} onChange - Callback fired with the full document string on changes.
 * @returns {EditorView}
 */
export function createEditor(container, initialDoc = "", onChange = () => {}) {
  let debounceTimer = null;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChange(update.state.doc.toString());
      }, 300);
    }
  });

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      rectangularSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      darkTheme,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      updateListener,
      EditorView.lineWrapping,
    ],
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  return view;
}

/**
 * Get the full document text from an EditorView.
 */
export function getEditorContent(view) {
  return view.state.doc.toString();
}

/**
 * Replace the entire editor content.
 */
export function setEditorContent(view, content) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}
