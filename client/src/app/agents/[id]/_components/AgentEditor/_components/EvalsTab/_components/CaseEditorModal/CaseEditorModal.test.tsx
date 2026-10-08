import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";
import type { EvalCaseRecord } from "@devdigest/shared";
import { ToastProvider } from "@/lib/toast";

const m = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), updateError: null as Error | null }));

vi.mock("@/lib/hooks", () => ({
  useCreateEvalCase: () => ({ mutate: m.create, isPending: false, error: null }),
  useUpdateEvalCase: () => ({ mutate: m.update, isPending: false, error: m.updateError }),
}));

import { CaseEditorModal } from "./CaseEditorModal";

const DIFF = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n line\n+const key = 'sk_live';\n line2";

afterEach(() => {
  cleanup();
  m.create.mockClear();
  m.update.mockClear();
  m.updateError = null;
});

const TWO_FILES = `${DIFF}\ndiff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-x\n+y`;

const RECORD = {
  id: "case-1",
  owner_id: "ag1",
  name: "stripe-key",
  input_diff: DIFF,
  input_meta: null,
  notes: null,
  expected_output: {
    expectations: [{ kind: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, title: null, severity: null, category: null }],
  },
  last_run: null,
} as unknown as EvalCaseRecord;

function renderModal(props: { record?: EvalCaseRecord; onClose?: () => void } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages }}>
      <ToastProvider>
        <CaseEditorModal agentId="ag1" record={props.record} onClose={props.onClose ?? vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CaseEditorModal", () => {
  it("keeps Save disabled until the draft is valid, then sends the typed payload", () => {
    renderModal();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(screen.getByText("Fix the highlighted fields to save.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "stripe-key" } });
    fireEvent.change(screen.getByPlaceholderText(/--- a\/src\/config\.ts/), { target: { value: DIFF } });
    expect(screen.getByText("1 file parsed")).toBeInTheDocument();
    // still no file chosen for the expectation
    expect(save).toBeDisabled();

    const [kind, file] = screen.getAllByRole("combobox");
    expect(kind).toHaveValue("must_find");
    fireEvent.change(file!, { target: { value: "src/a.ts" } });
    expect(save).toBeEnabled();

    // start > end blocks again
    fireEvent.change(screen.getByLabelText("Start line"), { target: { value: "9" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Start line"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "3" } });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    expect(m.create.mock.calls[0]![0]).toEqual({
      name: "stripe-key",
      input_diff: DIFF,
      input_meta: null,
      notes: null,
      expected_output: {
        expectations: [
          { kind: "must_find", file: "src/a.ts", start_line: 2, end_line: 3, title: null, severity: null, category: null },
        ],
      },
    });
  });

  it("disables Remove at one row and re-enables it after adding another", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add expectation" }));
    const removes = screen.getAllByRole("button", { name: "Remove" });
    expect(removes).toHaveLength(2);
    removes.forEach((b) => expect(b).toBeEnabled());
    fireEvent.click(removes[0]!);
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("offers every parsed path of a two-file diff in the file select", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/--- a\/src\/config\.ts/), { target: { value: TWO_FILES } });
    expect(screen.getByText("2 files parsed")).toBeInTheDocument();
    const [, file] = screen.getAllByRole("combobox");
    const options = within(file!).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(["", "src/a.ts", "src/b.ts"]);
  });

  it("updates an existing case with { id, input }", () => {
    renderModal({ record: RECORD });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "stripe-key-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledTimes(1);
    const [vars] = m.update.mock.calls[0]!;
    expect(vars.id).toBe("case-1");
    expect(vars.input).toMatchObject({ name: "stripe-key-2", input_diff: DIFF });
  });

  it("keeps the modal open and shows the server message when a save fails", () => {
    const onClose = vi.fn();
    m.updateError = new Error("Name already taken");
    renderModal({ record: RECORD, onClose });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // the mutation's onSuccess (which closes) never fires on failure
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the case: Name already taken");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("renders a case name as plain text, never as markup (AC-112)", () => {
    renderModal({ record: { ...RECORD, name: "**bold** <b>x</b>" } as EvalCaseRecord });
    expect(screen.getByLabelText("Name")).toHaveValue("**bold** <b>x</b>");
    expect(screen.getByText("Eval case · **bold** <b>x</b>")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });
});
