import datetime
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from beancount.core.number import ZERO
from beangrow.investments import AccountData
from beangrow.investments import Currency

from fava_portfolio_returns.api.portfolio import portfolio_values
from fava_portfolio_returns.core.portfolio import FilteredPortfolio
from fava_portfolio_returns.metrics.registry import get_metric
from fava_portfolio_returns.metrics.returns import compute_returns

# None marks dates where the asset is not held, which renders as a gap in the chart
GappedSeries = list[tuple[datetime.date, Optional[float]]]


@dataclass(frozen=True)
class AssetSeries:
    id: str
    name: str
    currency: Currency
    data: GappedSeries


def asset_returns_series(p: FilteredPortfolio, start_date: datetime.date, end_date: datetime.date) -> GappedSeries:
    """returns while the asset is held, None while it is not held (e.g. after it was sold)"""
    return [
        (value.date, None if value.market == ZERO and value.cost == ZERO else compute_returns(value.cost, value.market))
        for value in portfolio_values(p, start_date, end_date)
    ]


def assets_chart(
    p: FilteredPortfolio, start_date: datetime.date, end_date: datetime.date, metric_name: str
) -> list[AssetSeries]:
    """returns one metric series per commodity of the filtered portfolio"""
    metric = get_metric(metric_name)
    currency_by_code = {c.currency: c for c in p.portfolio.investments_config.currencies}
    account_data_by_currency: dict[Currency, list[AccountData]] = defaultdict(list)
    for account_data in p.account_data_list:
        account_data_by_currency[account_data.currency].append(account_data)

    assets = []
    for currency_code, account_data_list in account_data_by_currency.items():
        fp = FilteredPortfolio(p.portfolio, account_data_list, p.target_currency)
        data: GappedSeries
        if metric_name == "returns":
            data = asset_returns_series(fp, start_date, end_date)
        else:
            data = list(metric.series(fp, start_date, end_date))
        if all(value is None for _, value in data):
            continue

        currency = currency_by_code[currency_code]
        assets.append(AssetSeries(id=currency.id, name=currency.name, currency=currency.currency, data=data))

    # best performing asset first, by the last value while held
    return sorted(assets, key=lambda asset: last_value(asset.data), reverse=True)


def last_value(series: GappedSeries) -> float:
    return next(value for _, value in reversed(series) if value is not None)
