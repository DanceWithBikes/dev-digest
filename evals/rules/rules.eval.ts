import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./rules.cases.js";

describeWorkflow("rules", () => runWorkflowCases(cases));
