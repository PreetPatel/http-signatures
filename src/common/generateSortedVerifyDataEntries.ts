/*
 * Copyright 2019 - MATTR Limited
 * All rights reserved
 * Confidential and proprietary
 */

import { err, ok, Result } from "neverthrow";
import { __, all, has, not, pipe, reduce, toPairs } from "ramda";

import { VerifyData, VerifyDataEntry } from "./types";

import { splitWithSpace } from "./index";

const sortByDefault = (verifyData: VerifyData): VerifyDataEntry[] => Array.from(toPairs(verifyData)).sort();

/**
 * Sorts verifiedDataEntries into the order the header string defines
 * @param verifyData the entries of verify object which require sorting
 * @param coveredFields the covered fields string from the signature-input header, space delimited
 */
const sortByCoveredFields = (verifyData: VerifyData, coveredFields: string): Result<VerifyDataEntry[], string> => {
  // Avoid filtering as a side effect
  const iscoveredFieldsMissingKeys = pipe(splitWithSpace, all(has(__, verifyData)), not);
  if (iscoveredFieldsMissingKeys(coveredFields)) {
    return err("Header string must include the exact keys within verifyData"); // TODO update wording
  }

  const reduceCoveredFieldsToEntries = (
    accumulatedEntries: VerifyDataEntry[],
    currentHeader: string
  ): VerifyDataEntry[] => [...accumulatedEntries, [currentHeader, verifyData[currentHeader]]];
  const sortEntries = pipe(splitWithSpace, reduce<string, VerifyDataEntry[]>(reduceCoveredFieldsToEntries, []));
  const sortedEntries = sortEntries(coveredFields);

  return ok(sortedEntries);
};

/**
 * Sorts verifiedDataEntries into either the order the header string defines or a default fallback order
 * This guarantees the order is predictable even if headers isn't defined eg. on verify
 */
export const generateSortedVerifyDataEntries = (
  verifyData: VerifyData,
  coveredFields?: string
): Result<VerifyDataEntry[], string> =>
  coveredFields ? sortByCoveredFields(verifyData, coveredFields) : ok(sortByDefault(verifyData));
