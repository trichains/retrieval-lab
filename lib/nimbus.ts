import { DatasetSchema, type Dataset } from "@/src/core";
import raw from "@/datasets/nimbus.json";

/** The bundled dataset, validated once at load. */
export const NIMBUS: Dataset = DatasetSchema.parse(raw);
