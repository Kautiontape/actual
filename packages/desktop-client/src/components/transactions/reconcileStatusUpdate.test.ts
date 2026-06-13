import { reconcileStatusUpdate } from './reconcileStatusUpdate';

describe('reconcileStatusUpdate', () => {
  it('plain click clears an uncleared transaction', () => {
    expect(reconcileStatusUpdate(null, false)).toEqual({
      field: 'cleared',
      value: true,
    });
  });

  it('plain click un-clears a cleared transaction', () => {
    expect(reconcileStatusUpdate('cleared', false)).toEqual({
      field: 'cleared',
      value: false,
    });
  });

  it('shift+click reconciles a cleared transaction', () => {
    expect(reconcileStatusUpdate('cleared', true)).toEqual({
      field: 'reconciled',
      value: true,
    });
  });

  it('shift+click reconciles an uncleared transaction', () => {
    expect(reconcileStatusUpdate(null, true)).toEqual({
      field: 'reconciled',
      value: true,
    });
  });

  it('shift+click un-reconciles a reconciled transaction', () => {
    expect(reconcileStatusUpdate('reconciled', true)).toEqual({
      field: 'reconciled',
      value: false,
    });
  });
});
