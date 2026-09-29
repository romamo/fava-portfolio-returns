import { Alert, Box, ToggleButton, ToggleButtonGroup, useTheme } from "@mui/material";
import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { DefaultLabelFormatterCallbackParams, ECElementEvent, EChartsOption } from "echarts";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AssetSeries, AssetsMetric, useAssets } from "../api/assets";
import { PortfolioAllocation, usePortfolio } from "../api/portfolio";
import { Dashboard, DashboardRow, Panel, PanelGroup, PanelGroupItem } from "../components/Dashboard";
import { EChart, EChartsSpec } from "../components/EChart";
import { useToolbarContext } from "../components/Header/ToolbarProvider";
import { Loading } from "../components/Loading";
import { anyFormatter, timestampToDate, useCurrencyFormatter, usePercentFormatter } from "../components/format";
import { useSearchParam } from "../components/useSearchParam";
import { RootRoute } from "./__root";

const searchSchema = z.object({
  chart: z.enum(["performance", "value", "assets"]).default("performance").catch("performance"),
  assetsMetric: z.enum(["pnl", "returns"]).default("pnl").catch("pnl"),
});

export const PortfolioRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "portfolio",
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ chart: "performance", assetsMetric: "pnl" })],
  },
  component: Portfolio,
});

function Portfolio() {
  const { t } = useTranslation();
  const [chart, setChart] = useSearchParam(PortfolioRoute, "chart");
  const [assetsMetric, setAssetsMetric] = useSearchParam(PortfolioRoute, "assetsMetric");

  return (
    <Dashboard>
      <DashboardRow>
        <PanelGroup active={chart} setActive={setChart}>
          <PanelGroupItem id="performance" label={t("Performance")}>
            <Panel
              title={t("Performance")}
              help={t("The performance chart shows the total profit and loss of the portfolio.")}
              sx={{ flex: 2 }}
            >
              <PerformanceChart />
            </Panel>
          </PanelGroupItem>
          <PanelGroupItem id="value" label={t("Portfolio Value")}>
            <Panel
              title={t("Portfolio Value")}
              help={t("The portfolio value chart compares the market value with the cost value of the portfolio.")}
              sx={{ flex: 2 }}
            >
              <PortfolioValueChart />
            </Panel>
          </PanelGroupItem>
          <PanelGroupItem id="assets" label={t("Performance by Asset")}>
            <Panel
              title={t("Performance by Asset")}
              help={t(
                "The performance by asset chart shows the performance of each asset of the selected investments. In Returns mode, a line is only drawn while the asset is held. Click on a legend entry to hide or show an asset.",
              )}
              sx={{ flex: 2 }}
            >
              <AssetsChart metric={assetsMetric} setMetric={setAssetsMetric} />
            </Panel>
          </PanelGroupItem>
        </PanelGroup>
        <Panel title={t("Allocation")}>
          <AllocationChart />
        </Panel>
      </DashboardRow>
    </Dashboard>
  );
}

function PerformanceChart() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { investmentFilter, targetCurrency } = useToolbarContext();
  const currencyFormatter = useCurrencyFormatter(targetCurrency);
  const { isPending, error, data } = usePortfolio({
    investmentFilter,
    targetCurrency,
  });

  if (isPending) {
    return <Loading />;
  }
  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  const series = data.performanceChart;
  const firstValue = series.length > 0 ? series[0][1] : 0;
  const lastValue = series.length > 0 ? series[series.length - 1][1] : 0;
  const trendColor = lastValue >= firstValue ? theme.trend.positive : theme.trend.negative;
  const option: EChartsOption = {
    tooltip: {
      trigger: "axis",
      valueFormatter: anyFormatter(currencyFormatter),
    },
    grid: {
      left: 100,
      right: 20,
    },
    xAxis: {
      type: "time",
      axisPointer: {
        label: {
          formatter: (params) => timestampToDate(params.value as number),
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: currencyFormatter,
      },
    },
    series: {
      type: "line",
      name: t("Total P/L"),
      showSymbol: false,
      data: series,
      lineStyle: {
        color: trendColor(),
      },
      itemStyle: {
        color: trendColor(),
      },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0,
              color: trendColor(0.2),
            },
            {
              offset: 1,
              color: trendColor(0),
            },
          ],
        },
      },
    },
  };

  return <EChart height="400px" option={option} />;
}

function PortfolioValueChart() {
  const { t } = useTranslation();
  const { investmentFilter, targetCurrency } = useToolbarContext();
  const currencyFormatter = useCurrencyFormatter(targetCurrency);
  const { isPending, error, data } = usePortfolio({
    investmentFilter,
    targetCurrency,
  });

  if (isPending) {
    return <Loading />;
  }
  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  const option: EChartsOption = {
    tooltip: {
      trigger: "axis",
      valueFormatter: anyFormatter(currencyFormatter),
    },
    legend: {
      bottom: 0,
    },
    grid: {
      left: 100,
      right: 20,
    },
    xAxis: {
      type: "time",
      axisPointer: {
        label: {
          formatter: (params) => timestampToDate(params.value as number),
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: currencyFormatter,
      },
    },
    dataset: {
      source: data.valueChart,
    },
    series: [
      {
        type: "line",
        name: t("Market Value"),
        showSymbol: false,
        encode: { x: "date", y: "market" },
      },
      {
        type: "line",
        name: t("Cost Value"),
        showSymbol: false,
        encode: { x: "date", y: "cost" },
        step: "end", // increase invested capital at date of cash flow, do not interpolate
        lineStyle: {
          type: "dotted",
        },
      },
    ],
  };

  return <EChart height="400px" option={option} />;
}

interface AssetsChartProps {
  metric: AssetsMetric;
  setMetric: (metric: AssetsMetric) => void;
}

function AssetsChart({ metric, setMetric }: AssetsChartProps) {
  const { t } = useTranslation();
  const { investmentFilter, targetCurrency } = useToolbarContext();
  const currencyFormatter = useCurrencyFormatter(targetCurrency);
  const percentFormatter = usePercentFormatter();
  const { isPending, error, data } = useAssets({ investmentFilter, targetCurrency, metric });
  // assets hidden via legend; a ref, because toggling the legend must not re-render the chart
  const hidden = useRef(new Set<string>());
  // EChart re-creates the chart with all assets visible after every render, keep the hidden assets in sync
  useEffect(() => {
    hidden.current = new Set();
  });

  const metricSelection = (
    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={metric}
        onChange={(_, value: AssetsMetric | null) => value && setMetric(value)}
      >
        <ToggleButton value="pnl">{t("Total P/L")}</ToggleButton>
        <ToggleButton value="returns">{t("Returns")}</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );

  if (isPending) {
    return <Loading />;
  }
  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  const formatter = metric === "pnl" ? currencyFormatter : percentFormatter;
  const option: EChartsSpec = {
    color: assetColors,
    tooltip: {
      trigger: "axis",
      confine: true,
      // many assets do not fit into the chart height, allow scrolling the tooltip
      enterable: true,
      extraCssText: "max-height: 440px; overflow-y: auto;",
      formatter: (params) => assetsTooltip(params as AxisTooltipParams[], data.series, hidden.current, formatter),
    },
    legend: {
      type: "scroll",
      top: 0,
    },
    grid: {
      top: 40,
      left: 100,
      right: 20,
    },
    xAxis: {
      type: "time",
      axisPointer: {
        label: {
          formatter: (params) => timestampToDate(params.value as number),
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter,
      },
    },
    dataZoom: [
      {
        type: "slider",
      },
    ],
    series: data.series.map((asset) => ({
      type: "line",
      name: asset.currency,
      showSymbol: false,
      data: asset.data,
    })),
    onLegendSelectChanged: ({ selected }) => {
      hidden.current = new Set(Object.keys(selected).filter((currency) => !selected[currency]));
    },
  };

  return (
    <>
      {metricSelection}
      <EChart height="500px" option={option} />
    </>
  );
}

// axisValue is set for tooltips with trigger "axis", but missing in the exported echarts types
type AxisTooltipParams = DefaultLabelFormatterCallbackParams & { axisValue: number };

// default echarts palette, set explicitly to derive the color of an asset from its index
const assetColors = ["#5070dd", "#b6d634", "#505372", "#ff994d", "#0ca8df", "#ffd10a", "#fb628b", "#785db0", "#3fbe95"];

/** lists the assets held at the hovered date, best performing first */
function assetsTooltip(
  params: AxisTooltipParams[],
  assets: AssetSeries[],
  hidden: Set<string>,
  formatter: (value: number) => string,
) {
  if (params.length === 0) {
    return "";
  }
  // echarts omits series whose nearest point is far away from the hovered date,
  // therefore look up the last value on or before the hovered date of every asset instead
  const date = timestampToDate(params[0].axisValue);
  const held = assets
    .map((asset, index) => ({
      asset,
      color: assetColors[index % assetColors.length],
      value: asset.data.findLast(([pointDate]) => pointDate <= date)?.[1] ?? null,
    }))
    .filter((item): item is { asset: AssetSeries; color: string; value: number } => item.value !== null)
    .filter(({ asset }) => !hidden.has(asset.currency))
    .sort((a, b) => b.value - a.value);

  const rows = held.map(
    ({ asset, color, value }) =>
      `<div style="display:flex;justify-content:space-between;gap:20px">` +
      `<span><span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${color}"></span>${asset.currency}</span>` +
      `<b>${formatter(value)}</b></div>`,
  );
  return [`<div>${date}</div>`, ...rows].join("");
}

function AllocationChart() {
  const { investmentFilter, setInvestmentFilter, targetCurrency } = useToolbarContext();
  const currencyFormatter = useCurrencyFormatter(targetCurrency, { integer: true });
  const { isPending, error, data } = usePortfolio({ investmentFilter, targetCurrency });

  if (isPending) {
    return <Loading />;
  }
  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  const option: EChartsSpec = {
    tooltip: {
      confine: true,
      valueFormatter: anyFormatter(currencyFormatter),
    },
    series: [
      {
        type: "treemap",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        breadcrumb: {
          show: false,
        },
        itemStyle: {
          borderRadius: 3,
          gapWidth: 2,
        },
        label: {
          formatter: ({ data }) => {
            const allocation = data as PortfolioAllocation;
            return `{currency|${allocation.currency}}\n${currencyFormatter(allocation.marketValue)}`;
          },
          rich: {
            currency: {
              fontWeight: "bold",
            },
          },
        },
        labelLayout: (params) => ({
          y: params.labelRect.y,
          align: "center",
        }),
        data: data.allocation.map((allocation) => ({
          ...allocation,
          name: allocation.name,
          value: allocation.marketValue,
        })),
      },
    ],
    onClick: ({ data }: ECElementEvent) => {
      const allocation = data as PortfolioAllocation;
      setInvestmentFilter([allocation.id]);
    },
  };

  // compensate for empty help text
  return (
    <>
      <p>&nbsp;</p>
      <EChart height="400px" option={option} />
    </>
  );
}
