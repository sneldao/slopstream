import { describe, expect, it } from "vitest";
import {
  contractStateQuery,
  isValidContractAddress,
  normalizeNullifier,
  readNullifierWindow,
} from "./verifyProof";

const HEX64 = "a".repeat(64);

describe("normalizeNullifier", () => {
  it("accepts the shapes a receipt actually prints", () => {
    expect(normalizeNullifier(`midnight_${HEX64}`)).toBe(HEX64);
    expect(normalizeNullifier(`0x${HEX64}`)).toBe(HEX64);
    expect(normalizeNullifier(`  ${HEX64.toUpperCase()}  `)).toBe(HEX64);
  });

  it("refuses anything that is not a 64-hex nullifier", () => {
    expect(normalizeNullifier("")).toBeNull();
    expect(normalizeNullifier("midnight_")).toBeNull();
    expect(normalizeNullifier("a".repeat(63))).toBeNull();
    expect(normalizeNullifier("g".repeat(64))).toBeNull();
    expect(normalizeNullifier(`${HEX64} OR 1=1`)).toBeNull();
  });
});

describe("isValidContractAddress", () => {
  it("accepts identifier-shaped addresses", () => {
    expect(isValidContractAddress("582e29ad28133428c93c7fbf")).toBe(true);
    expect(isValidContractAddress(" addr_1:2 ")).toBe(true);
  });

  it("rejects anything that could break out of the GraphQL query", () => {
    expect(isValidContractAddress('a" { data } }')).toBe(false);
    expect(isValidContractAddress("addr; rm -rf")).toBe(false);
    expect(isValidContractAddress("")).toBe(false);
    expect(isValidContractAddress("x".repeat(201))).toBe(false);
  });

  it("keeps the address out of the query body unless it was allowlisted", () => {
    expect(JSON.parse(contractStateQuery(" abc123 ")).query).toContain(
      'address: "abc123"',
    );
  });
});

describe("readNullifierWindow", () => {
  const payload = (data: unknown) => ({ data: { contractState: { data } } });

  it("reports a hit", () => {
    expect(
      readNullifierWindow(payload(`state ${HEX64} tail`), HEX64).kind,
    ).toBe("found");
  });

  it("reports an genuine miss only when state was read", () => {
    expect(readNullifierWindow(payload("some other state"), HEX64)).toEqual({
      kind: "not-found",
      stateData: "some other state",
    });
  });

  it("never turns an unread response into 'no record'", () => {
    expect(readNullifierWindow({}, HEX64).kind).toBe("unread");
    expect(readNullifierWindow(payload(undefined), HEX64).kind).toBe("unread");
    expect(readNullifierWindow(payload(null), HEX64).kind).toBe("unread");
    expect(readNullifierWindow(null, HEX64).kind).toBe("unread");
  });
});
