import datetime
import unittest
from pathlib import Path

from fava_portfolio_returns.api.assets import assets_chart
from fava_portfolio_returns.test.test import BEANGROW_CONFIG_CORPAB
from fava_portfolio_returns.test.test import approx2
from fava_portfolio_returns.test.test import load_portfolio_file
from fava_portfolio_returns.test.test import load_portfolio_str


class TestAssets(unittest.TestCase):
    def test_one_series_per_commodity(self):
        p = load_portfolio_file(Path("example/example.beancount"))
        start, end = datetime.date(2020, 1, 1), datetime.date(2023, 1, 1)
        assets = assets_chart(p, start, end, "pnl")

        currencies = [asset.currency for asset in assets]
        assert len(currencies) == len(set(currencies))
        assert set(currencies) == {ad.currency for ad in p.account_data_list}
        for asset in assets:
            assert asset.id == f"c_{asset.currency}"
            assert asset.data[0][0] >= start
            assert asset.data[-1][0] <= end
        last_values = [asset.data[-1][1] for asset in assets]
        assert all(value is not None for value in last_values)
        present = [value for value in last_values if value is not None]
        assert present == sorted(present, reverse=True)

    def test_returns_metric(self):
        p = load_portfolio_file("savings_plan")
        assets = assets_chart(p, datetime.date(2020, 1, 1), datetime.date(2020, 4, 1), "returns")
        assert [asset.currency for asset in assets] == ["CORP"]
        assert [value for _, value in assets[0].data] == [0.0, 0.2, approx2(0.33), approx2(0.43)]

    def test_returns_gap_while_not_held(self):
        p = load_portfolio_str(
            """
plugin "beancount.plugins.auto_accounts"
plugin "beancount.plugins.implicit_prices"

2020-01-01 commodity CORPA
2020-01-01 commodity CORPB

2020-01-01 * "Buy 100 CORPA @ 1 USD"
  Assets:Cash                           -100.00 USD
  Assets:CORPA                              100 CORPA {1 USD}

2020-01-01 * "Buy 100 CORPB @ 1 USD"
  Assets:Cash                           -100.00 USD
  Assets:CORPB                              100 CORPB {1 USD}

2020-01-15 price CORPB 2 USD

2020-02-01 * "Sell 100 CORPB @ 2 USD"
  Assets:Cash                            200.00 USD
  Assets:CORPB                             -100 CORPB {1 USD} @ 2 USD
  Income:Gains

2020-03-01 * "Buy 100 CORPB @ 3 USD"
  Assets:Cash                           -300.00 USD
  Assets:CORPB                              100 CORPB {3 USD}

2020-03-15 price CORPB 6 USD
            """,
            BEANGROW_CONFIG_CORPAB,
        )
        assets = assets_chart(p, datetime.date(2020, 1, 1), datetime.date(2020, 4, 1), "returns")
        corpb = next(asset for asset in assets if asset.currency == "CORPB")
        assert corpb.data == [
            (datetime.date(2020, 1, 1), 0.0),
            (datetime.date(2020, 1, 15), 1.0),
            (datetime.date(2020, 2, 1), None),  # sold
            (datetime.date(2020, 3, 1), 0.0),  # bought again
            (datetime.date(2020, 3, 15), 1.0),
        ]

    def test_returns_sold_before_period(self):
        p = load_portfolio_str(
            """
plugin "beancount.plugins.auto_accounts"
plugin "beancount.plugins.implicit_prices"

2020-01-01 commodity CORPA
2020-01-01 commodity CORPB

2020-01-01 * "Buy 100 CORPA @ 1 USD"
  Assets:Cash                           -100.00 USD
  Assets:CORPA                              100 CORPA {1 USD}

2020-01-01 * "Buy 100 CORPB @ 1 USD"
  Assets:Cash                           -100.00 USD
  Assets:CORPB                              100 CORPB {1 USD}

2020-02-01 * "Sell 100 CORPB @ 2 USD"
  Assets:Cash                            200.00 USD
  Assets:CORPB                             -100 CORPB {1 USD} @ 2 USD
  Income:Gains

2020-03-01 price CORPA 3 USD
            """,
            BEANGROW_CONFIG_CORPAB,
        )
        start, end = datetime.date(2020, 2, 15), datetime.date(2020, 4, 1)
        assert [asset.currency for asset in assets_chart(p, start, end, "returns")] == ["CORPA"]
        # P/L keeps the realized gain of the sold asset
        assert [asset.currency for asset in assets_chart(p, start, end, "pnl")] == ["CORPA", "CORPB"]

    def test_invalid_metric(self):
        p = load_portfolio_file("savings_plan")
        with self.assertRaises(ValueError):
            assets_chart(p, datetime.date(2020, 1, 1), datetime.date(2020, 4, 1), "unknown")
