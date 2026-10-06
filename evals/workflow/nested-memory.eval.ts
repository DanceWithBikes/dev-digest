import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./nested-memory.cases.js";

describeWorkflow("nested-memory", () => runWorkflowCases(cases));
