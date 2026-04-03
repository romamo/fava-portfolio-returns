import datetime
from typing import Optional

from beancount import Amount
from beancount import Currency
from beancount import Position
from beancount.core import convert
from fava.helpers import FavaAPIError

from beangrow.returns import Pricer as BeangrowPricer


class CurrencyConversionException(FavaAPIError):
    def __init__(self, source: str, target: str, date: Optional[datetime.date] = None):
        date = date or datetime.date.today()
        super().__init__(
            f"Could not convert {source} to {target} on {date}."
            f" Please add a price directive '{date} price {source} <conversion_rate> {target}' to your ledger."
        )


class Pricer(BeangrowPricer):
    def convert_amount(self, amount: Amount, target_currency: Currency, date: Optional[datetime.date] = None) -> Amount:
        # 1. Try conversion for the requested date (historical or current)
        target_amt = super().convert_amount(amount, target_currency, date)
        if target_amt.currency == target_currency:
            return target_amt

        # 2. Fallback: If requested date fails, try finding the latest available price in the ledger
        if date is not None:
            latest_amt = super().convert_amount(amount, target_currency, None)
            if latest_amt.currency == target_currency:
                return latest_amt

        # 3. Fail: If both failed, then the price is actually missing from the ledger
        raise CurrencyConversionException(target_amt.currency, target_currency, date)

    def convert_position(self, pos: Position, target_currency: Currency, date: Optional[datetime.date] = None):
        # 1. Try conversion for the requested date
        target_pos = convert.convert_position(pos, target_currency, self.price_map, date)
        if target_pos.currency == target_currency:
            return target_pos

        # 2. Fallback: Try latest available price
        if date is not None:
            latest_pos = convert.convert_position(pos, target_currency, self.price_map, None)
            if latest_pos.currency == target_currency:
                return latest_pos

        # 3. Fail
        raise CurrencyConversionException(target_pos.currency, target_currency, date)
