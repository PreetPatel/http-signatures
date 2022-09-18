/*
 * Copyright 2019 - MATTR Limited
 * All rights reserved
 * Confidential and proprietary
 */

import { ok, err, Result } from "neverthrow";
import { toLower } from "ramda";
import { parseDictionary, Item, Parameters, InnerList } from "structured-headers";

export type SignatureInputSetParams = {
  [signatureId: string]: ResponseParams;
};

type SignatureInputParams = {
  keyid: string;
  created: number;
  expires?: number;
  alg: string;
  nonce?: string;
  coveredFields?: [string, Parameters][];
};

type ResponseParams = SignatureInputParams & {
  readonly signature: string;
};
/**
 * Parses the values in the signature-input and signature headers
 */
export const getSignatureData = (
  signatureHeaderValue: string,
  signatureInputHeaderValue: string
): Result<SignatureInputSetParams, string> => {
  const signatureInputHeaderMap: Map<string, Item | InnerList> = parseDictionary(signatureInputHeaderValue);
  const signatureHeaderMap: Map<string, Item | InnerList> = parseDictionary(signatureHeaderValue);

  let signatureData: SignatureInputSetParams = {};

  for (const entry of signatureInputHeaderMap) {
    const [signatureId, signatureFields] = entry;

    if (signatureId in signatureData) {
      // duplicate keys in signature-input field
      return err("Invalid signature data");
    }

    const [coveredFieldsList, signatureParams] = signatureFields;

    const coveredFields: [string, Parameters][] = Object.values(coveredFieldsList).map((a) => [toLower(a[0]), a[1]]);

    const keyid: string | undefined = signatureParams.get("keyid") as string;
    const created: number | undefined = signatureParams.get("created") as number;
    const alg: string | undefined = signatureParams.get("alg") as string;
    const expires: number | undefined = signatureParams.get("expires") as number;
    const nonce: string | undefined = signatureParams.get("nonce") as string;

    if (!keyid || !created || !alg || !coveredFields.length || !signatureId) {
      return err("Signature input string is missing a required field");
    }

    const signatureMap = signatureHeaderMap.get(signatureId);

    if (!signatureMap) {
      return err("One or more signatures is invalid");
    }

    const signature: string = Object.values(signatureMap[0])[0] as string;

    signatureData = {
      ...signatureData,
      [signatureId]: {
        keyid,
        created,
        expires,
        alg,
        nonce,
        coveredFields,
        signature,
      },
    };
  }

  return ok(signatureData);
};
