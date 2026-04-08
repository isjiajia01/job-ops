import type { TracerAnalyticsResponse } from "@shared/types.js";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { SectionCard } from "@client/components/layout";

type TracerClicksChartProps = {
  chartData: TracerAnalyticsResponse["timeSeries"];
  isLoading: boolean;
  visibleDays: number;
};

const chartConfig = {
  clicks: {
    label: "Clicks",
    color: "var(--chart-1)",
  },
};

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const TracerClicksChart: React.FC<TracerClicksChartProps> = ({
  chartData,
  isLoading,
  visibleDays,
}) => {
  return (
    <SectionCard className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">
            Resume Clicks Last {visibleDays} Days
          </h2>
          <p className="text-xs text-muted-foreground">
            Daily click activity from tracer links.
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="flex h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading analytics...
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value) => formatDayLabel(String(value))}
            />
            <YAxis axisLine={false} tickLine={false} width={30} />
            <ChartTooltip
              cursor={{ fill: "var(--color-clicks)", opacity: 0.18 }}
              content={
                <ChartTooltipContent
                  nameKey="clicks"
                  labelFormatter={(value) => formatDayLabel(String(value))}
                />
              }
            />
            <Bar
              dataKey="clicks"
              fill="var(--color-clicks)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
    </SectionCard>
  );
};
