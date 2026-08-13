import { HopaeService } from './hopae.service';

function queryResult<T>(value: T) {
  const query = {
    select: () => query,
    lean: () => query,
    exec: async () => value,
  };
  return query;
}

function distinctResult(values: string[]) {
  return { exec: async () => values };
}

describe('HopaeService', () => {
  it('combines v2, chat, and ranking account links without duplicates', async () => {
    const searchExec = jest.fn().mockResolvedValue({ acknowledged: true });
    const searches = {
      updateOne: jest.fn().mockReturnValue({ exec: searchExec }),
      aggregate: jest.fn(),
    };
    const v2 = {
      findOne: jest
        .fn()
        .mockReturnValue(
          queryResult({ Name: 'main', MSWID: { legacyLong: '123456789' } }),
        ),
      find: jest
        .fn()
        .mockReturnValue(
          queryResult([{ Name: 'main' }, { Name: 'legacyAlt' }]),
        ),
    };
    const v4 = {
      distinct: jest.fn().mockReturnValue(distinctResult(['Ab123'])),
      find: jest
        .fn()
        .mockReturnValue(
          queryResult([
            { name: 'main' },
            { name: 'chatAlt' },
            { name: 'legacyAlt' },
          ]),
        ),
    };
    const v3 = {
      distinct: jest.fn().mockReturnValue(distinctResult(['ab123', 'CD456'])),
      find: jest
        .fn()
        .mockReturnValue(
          queryResult([{ Name: 'rankAlt' }, { Name: 'chatAlt' }]),
        ),
    };
    const service = new HopaeService(
      v2 as any,
      v3 as any,
      v4 as any,
      searches as any,
    );

    await expect(service.searchByName(' main ', '127.0.0.1')).resolves.toEqual({
      query: 'main',
      names: ['main', 'chatAlt', 'legacyAlt', 'rankAlt'],
    });
    expect(v2.find).toHaveBeenCalledWith({
      MSWID: { legacyLong: '123456789' },
    });
    expect(v4.distinct).toHaveBeenCalledWith('worldTagId', {
      name: { $in: ['main', 'legacyAlt'] },
    });
    expect(v3.find).toHaveBeenCalledWith({
      MswKey: { $in: ['ab123', 'cd456'] },
    });
    expect(searches.updateOne).toHaveBeenCalledTimes(1);
  });

  it('returns the requested name when no data source has a match', async () => {
    const searches = {
      updateOne: jest.fn(),
      aggregate: jest.fn(),
    };
    const v2 = {
      findOne: jest.fn().mockReturnValue(queryResult(null)),
      find: jest.fn(),
    };
    const v4 = {
      distinct: jest.fn().mockReturnValue(distinctResult([])),
      find: jest.fn(),
    };
    const v3 = {
      distinct: jest.fn().mockReturnValue(distinctResult([])),
      find: jest.fn(),
    };
    const service = new HopaeService(
      v2 as any,
      v3 as any,
      v4 as any,
      searches as any,
    );

    await expect(service.searchByName('solo', '127.0.0.1')).resolves.toEqual({
      query: 'solo',
      names: ['solo'],
    });
    expect(v2.find).not.toHaveBeenCalled();
    expect(v4.find).not.toHaveBeenCalled();
    expect(v3.find).not.toHaveBeenCalled();
    expect(searches.updateOne).not.toHaveBeenCalled();
  });

  it('returns the daily top five search ranking', async () => {
    const exec = jest.fn().mockResolvedValue([
      { _id: 'main', searchCount: 3 },
      { _id: 'other', searchCount: 2 },
    ]);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const service = new HopaeService(
      {} as any,
      {} as any,
      {} as any,
      { aggregate } as any,
    );

    await expect(service.getDailyRanking()).resolves.toEqual([
      { name: 'main', searchCount: 3 },
      { name: 'other', searchCount: 2 },
    ]);
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline).toEqual(expect.arrayContaining([{ $limit: 5 }]));
  });
});
