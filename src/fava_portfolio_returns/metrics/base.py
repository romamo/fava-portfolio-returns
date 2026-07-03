import abc
import datetime
import math

from beangrow.reports import Interval

from fava_portfolio_returns.core.portfolio import FilteredPortfolio

Series = list[tuple[datetime.date, float]]


def finite_or_none(value: float) -> float | None:
    """Return ``None`` for non-finite metrics so they serialize to JSON null.

    Return metrics such as IRR (solved numerically with ``fsolve``) and the
    Modified Dietz Method (divides by average capital) are undefined for
    degenerate groups, e.g. a group with zero average capital over the range.
    They come back as NaN/inf, which JSON cannot represent: emitting them would
    crash response serialization. ``None`` lets the frontend render them as N/A.
    """
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


class MetricBase(abc.ABC):
    def single(self, p: FilteredPortfolio, start_date: datetime.date, end_date: datetime.date) -> float:
        raise NotImplementedError("single() is not implemented for this metric")

    def series(self, p: FilteredPortfolio, start_date: datetime.date, end_date: datetime.date) -> Series:
        raise NotImplementedError("series() is not implemented for this metric")

    def rebase(self, base: float, series: Series) -> Series:
        """rebase series to align them at 0; useful when comparing multiple series"""
        raise NotImplementedError("rebase() is not implemented for this metric")

    def intervals(self, p: FilteredPortfolio, intervals: list[Interval]) -> list[tuple[str, float | None]]:
        return [
            (interval_name, finite_or_none(self.single(p, start_date, end_date)))
            for interval_name, start_date, end_date in intervals
        ]

    def rolling_window(
        self,
        p: FilteredPortfolio,
        start_date: datetime.date,
        end_date: datetime.date,
        window_days: int = 365,
        max_points: int = 20,
    ) -> list[tuple[datetime.date, float | None]]:
        window_delta = datetime.timedelta(days=window_days)

        cash_flows = p.cash_flows()
        if cash_flows and start_date - window_delta < cash_flows[0].date:
            # make sure window starts after first cash flow
            start_date = cash_flows[0].date + window_delta

        num_days = (end_date - start_date).days
        step = max(num_days // max_points, 1)
        dates = (start_date + datetime.timedelta(n) for n in range(0, num_days, step))
        return [(date, finite_or_none(self.single(p, date - window_delta, date))) for date in dates]
