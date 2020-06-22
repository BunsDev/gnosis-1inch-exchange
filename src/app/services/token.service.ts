import { Injectable } from '@angular/core';
import { combineLatest, Observable, throwError } from 'rxjs';
import { ISymbol2Token, ITokenDescriptor, TokenHelper } from './token.helper';
import { OneInchApiService } from './1inch.api/1inch.api.service';
import { map, mergeMap, shareReplay } from 'rxjs/operators';
import { TokenData, TokenDataHelperService } from './token-data-helper.service';
import { zeroValueBN } from '../utils';
import { BigNumber } from 'ethers/utils';

@Injectable({
  providedIn: 'root'
})
export class TokenService {

  public tokenHelper$: Observable<TokenHelper> = this.oneInchApiService.getTokens$()
    .pipe(
      map((tokens: ISymbol2Token) => {

        return new TokenHelper(tokens);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  private tokens$ = this.tokenHelper$.pipe(
    map((tokenHelper) => {

      return tokenHelper.tokens;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private tokenData$: Observable<TokenData>;

  private usdFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  constructor(
    private oneInchApiService: OneInchApiService,
    private tokenDataHelperService: TokenDataHelperService
  ) {
  }

  public getSortedTokens(): Observable<ITokenDescriptor[]> {

    if (!this.tokenData$) {
      return throwError('set token data first');
    }

    return combineLatest([this.tokenHelper$, this.tokens$, this.tokenData$]).pipe(
      map(([tokenHelper, symbols2Tokens, tokenData]) => {

        return this.sortTokens(tokenHelper, tokenData, symbols2Tokens, '');
      })
    );
  }

  public setTokenData(walletAddress: string): void {

    this.tokenData$ = this.tokens$.pipe(
      mergeMap((symbols2Tokens: ISymbol2Token) => {

        return this.tokenDataHelperService.getTokenBalancesAndPrices(
          walletAddress,
          symbols2Tokens
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  private sortTokens(
    tokenHelper: TokenHelper,
    tokenData: TokenData,
    symbols2Tokens: ISymbol2Token,
    term: string = ''
  ): ITokenDescriptor[] {

    this.assignPricesAndBalances2Tokens(tokenHelper, symbols2Tokens, tokenData);

    const tokens = Object.values(symbols2Tokens);
    if (
      term !== '' &&
      tokens.findIndex((x) => x.symbol === term) === -1
    ) {
      return [];
    }

    return tokens
      .sort((firstEl, secondEl) => sortSearchResults(term, firstEl, secondEl))
      .slice(0, 50);

  }

  private assignPricesAndBalances2Tokens(
    tokenHelper: TokenHelper,
    tokens: ISymbol2Token,
    tokenData: TokenData
  ): void {

    const symbols = Object.keys(tokens);

    const { balances, usdBalances } = tokenData;

    for (let i = 0; i < balances.length; i++) {

      const token = tokens[symbols[i]];
      const balance = balances[i];
      const usdBalance = usdBalances[i];

      if (!token || !balance) {
        console.log(tokens[i].symbol);
        continue;
      }

      token.balance = balance;
      const formattedTokenBalance = tokenHelper.formatAsset(
        token.symbol,
        token.balance as BigNumber
      );
      token.formatedTokenBalance = tokenHelper.toFixed(
        formattedTokenBalance,
        token.decimals
      );

      if (usdBalance.isZero()) {
        token.usd = 0;
        token.formatedUSD = 0;
        continue;
      }

      token.usd = +tokenHelper.formatUnits(usdBalance, 8);
      token.formatedUSD = this.usdFormatter.format(token.usd);
    }
  }

}

function sortSearchResults(term, firstEl: ITokenDescriptor, secondEl: ITokenDescriptor) {

  if (!firstEl.usd) {
    firstEl.usd = 0;
  }

  if (!secondEl.usd) {
    secondEl.usd = 0;
  }

  if (!firstEl.balance) {
    firstEl.balance = zeroValueBN;
  }

  if (!secondEl.balance) {
    secondEl.balance = zeroValueBN;
  }

  if (firstEl.symbol.toLowerCase() === term.toLowerCase()) {

    return -1;
  }

  if (Number(firstEl.usd) > Number(secondEl.usd)) {

    return -1;
  }

  if (Number(firstEl.usd) < Number(secondEl.usd)) {

    return 1;
  }

  return 0;
}