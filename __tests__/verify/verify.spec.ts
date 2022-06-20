/*
 * Copyright 2019 - MATTR Limited
 * All rights reserved
 * Confidential and proprietary
 */
import * as base64 from "@stablelib/base64";
import { generateKeyPairFromSeed, KeyPair, sign, verify } from "@stablelib/ed25519";

import { verifySignatureHeader, createSignatureHeader, CreateSignatureHeaderOptions } from "../../src";
import { reduceKeysToLowerCase } from "../../src/common";
import { createSignatureHeaderOptions } from "../__fixtures__/createSignatureHeaderOptions";

describe("verifySignatureHeader", () => {
  Date.now = jest.fn(() => 1577836800); //01.01.2020

  const verifyEd25519 =
    (publicKey: Uint8Array) =>
    async (keyId: string, data: Uint8Array, signature: Uint8Array): Promise<boolean> =>
      await verify(publicKey, data, signature);

  let createSignatureResult: { digest?: string; signature: string };
  let keyPair: KeyPair;

  beforeEach(async () => {
    keyPair = generateKeyPairFromSeed(new Uint8Array(32));
    const signEd25519 = async (data: Uint8Array): Promise<Uint8Array> => await sign(keyPair.secretKey, data);
    const createOptions: CreateSignatureHeaderOptions = {
      ...createSignatureHeaderOptions,
      signer: { keyId: "key1", sign: signEd25519 },
    };
    await createSignatureHeader(createOptions).then((res) => {
      expect(res.isOk()).toBe(true);
      res.isOk() ? (createSignatureResult = res.value) : undefined;
    });
  });

  it("Should verify a valid signature", async () => {
    const validHttpHeaderInput = {
      Digest: `${createSignatureResult.digest}`,
      Signature: createSignatureResult.signature,
    };
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        ...validHttpHeaderInput,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
    });
    expect(result.isOk()).toBe(true);

    const lowerCaseValidHttpHeaderInput = reduceKeysToLowerCase(validHttpHeaderInput);
    const resultWithLowerCaseHeader = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        ...lowerCaseValidHttpHeaderInput,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
    });
    expect(resultWithLowerCaseHeader.isOk()).toBe(true);
  });

  it("Should return verified false when verifying a tampered signature", async () => {
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: "PUT",
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isErr()) {
      throw "result is an error";
    }

    expect(result.value).toEqual(false);
  });

  it("Should ignore headers not included in a signature string headers", async () => {
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        extraHeader: "value",
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
      body: createSignatureHeaderOptions.body,
    });

    expect(result.isOk()).toBe(true);
  });

  it("Should return verified false if headers to verify do not match headers defined in the signature string", async () => {
    const result = await verifySignatureHeader({
      httpHeaders: {
        randomHeader: "value",
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isErr()) {
      throw "result is an error";
    }

    expect(result.value).toEqual(false);
  });

  it("Should return verified false if signature header is not a string", async () => {
    const result = await verifySignatureHeader({
      httpHeaders: {},
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
    });

    if (result.isErr()) {
      throw "result is an error";
    }

    expect(result.value).toEqual(false);
  });

  test.each([
    ["keyId", `created=1,headers="",signature=""`],
    ["signature", `created=1,headers="",keyId=""`],
    ["created", `signature="",headers="",keyId=""`],
    ["headers", `signature="",created=1,keyId=""`],
  ])("Should return verified false when signature header value is missing %s field", async (missing, headerValue) => {
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Signature: headerValue,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
      body: createSignatureHeaderOptions.body,
    });

    expect(result).toMatchObject({ value: false });
  });

  it("Should return verified false if an err is returned from decoding", async () => {
    const mockDecode = jest.spyOn(base64, "decodeURLSafe");
    const errorString = "error decoding";
    mockDecode.mockImplementationOnce(() => {
      throw Error(errorString);
    });

    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isErr()) {
      throw "result is an error";
    }

    expect(result.value).toEqual(false);
  });

  it("Should return verified false if included http headers contain duplicate case insensitive headers", async () => {
    // NOTE: We don't return verified result error messages so cannot confirm exact place of failure just that it returned false
    // We could achieve this by creating and running expects on spys surrounding the expected failure point
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: verifyEd25519(keyPair.publicKey) },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isErr()) {
      throw "result is an error";
    }
    expect(result.value).toEqual(false);
  });

  it("Should return a verified false if the body has been tampered", async () => {
    const badVerify = (): Promise<boolean> => Promise.reject(Error("unexpected error"));
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: badVerify },
      body: { tampered: "body" },
    });

    if (result.isErr()) {
      throw "result is an error";
    }
    expect(result.value).toEqual(false);
  });

  it("Should return a verified false if the body is undefined but the digest header is not", async () => {
    const badVerify = (): Promise<boolean> => Promise.reject(Error("unexpected error"));
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: badVerify },
    });

    if (result.isErr()) {
      throw "result is an error";
    }
    expect(result.value).toEqual(false);
  });

  it("Should return a verified false if the digest header is a string array", async () => {
    const badVerify = (): Promise<boolean> => Promise.reject(Error("unexpected error"));
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: ["string", "array"],
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: badVerify },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isErr()) {
      throw "result is an error";
    }
    expect(result.value).toEqual(false);
  });

  it("Should return a handled error if an error is thrown in the verify function", async () => {
    const error = Error("unexpected error");
    const badVerify = (): Promise<boolean> => Promise.reject(error);
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: badVerify },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isOk()) {
      throw "result is not an error";
    }

    expect(result.error).toEqual({
      type: "VerifyFailed",
      message: "Failed to verify signature header",
    });
  });

  it("Should return a handled error if an unexpected error is thrown in the verify function", async () => {
    const error = Error("unexpected error");
    const badVerify = (): Promise<boolean> => {
      throw error;
    };
    const result = await verifySignatureHeader({
      httpHeaders: {
        ...createSignatureHeaderOptions.httpHeaders,
        Digest: `${createSignatureResult.digest}`,
        Signature: createSignatureResult.signature,
      },
      method: createSignatureHeaderOptions.method,
      url: createSignatureHeaderOptions.url,
      verifier: { verify: badVerify },
      body: createSignatureHeaderOptions.body,
    });

    if (result.isOk()) {
      throw "result is not an error";
    }

    expect(result.error).toEqual({
      type: "VerifyFailed",
      message: "An error occurred when verifying signature header",
    });
  });
});
