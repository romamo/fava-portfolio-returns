import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useFavaFilterSearchParams } from "../routes/__root";
import { fetchJSON } from "./api";
import { InvestmentId } from "./config";

export type AssetsMetric = "pnl" | "returns";

interface AssetsRequest {
  investmentFilter: InvestmentId[];
  targetCurrency: string;
  metric: AssetsMetric;
}

/** value is null while the asset is not held (e.g. after it was sold) */
export type GappedSeries = [string, number | null][];

export interface AssetSeries {
  id: InvestmentId;
  name: string;
  currency: string;
  data: GappedSeries;
}

export interface AssetsResponse {
  series: AssetSeries[];
}

export function useAssets(request: AssetsRequest): UseQueryResult<AssetsResponse> {
  const params = useFavaFilterSearchParams();
  params.set("investments", request.investmentFilter.join(","));
  params.set("currency", request.targetCurrency);
  params.set("metric", request.metric);
  const url = `assets?${params}`;

  return useQuery({
    queryKey: [url],
    queryFn: () => fetchJSON<AssetsResponse>(url),
  });
}
