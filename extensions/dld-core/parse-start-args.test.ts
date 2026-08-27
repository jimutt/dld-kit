import { describe, expect, test } from "bun:test";
import { parseStartArgs } from "./parse-start-args.ts";

describe("parseStartArgs", () => {
	test("range form expands and pads the slug", () => {
		const result = parseStartArgs(["DL-014..DL-022"]);
		expect(result).toEqual({
			slug: "dl-014-022",
			title: "DL-014 through DL-022",
			decisionIds: Array.from({ length: 9 }, (_, i) => `DL-0${14 + i}`),
		});
	});

	test("dash form with spaces is the same range", () => {
		const result = parseStartArgs(["DL-014", "-", "DL-016"]);
		expect(result).toMatchObject({ slug: "dl-014-016", decisionIds: ["DL-014", "DL-015", "DL-016"] });
	});

	test("reversed range is an error", () => {
		const result = parseStartArgs(["DL-022..DL-014"]);
		expect(result).toHaveProperty("error");
	});

	test("positional decisions derive slug and title", () => {
		const result = parseStartArgs(["DL-001", "DL-002"]);
		expect(result).toEqual({ slug: "dl-001-002", title: "DL-001 batch", decisionIds: ["DL-001", "DL-002"] });
	});

	test("explicit slug and title with positional decisions", () => {
		const result = parseStartArgs(["my-batch", "DL-001", "DL-002"]);
		expect(result).toEqual({ slug: "my-batch", title: "my-batch", decisionIds: ["DL-001", "DL-002"] });
	});

	test("--decisions flag with slug", () => {
		const result = parseStartArgs(["my-batch", "--decisions", "DL-001,DL-002"]);
		expect(result).toEqual({ slug: "my-batch", title: "my-batch", decisionIds: ["DL-001", "DL-002"] });
	});

	test("--decisions as the first token does not become the slug", () => {
		const result = parseStartArgs(["--decisions", "DL-001,DL-002"]);
		expect(result).toMatchObject({ slug: "dl-001-002", decisionIds: ["DL-001", "DL-002"] });
	});

	test("no decisions is an error", () => {
		expect(parseStartArgs(["my-batch"])).toHaveProperty("error");
		expect(parseStartArgs([])).toHaveProperty("error");
	});
});
