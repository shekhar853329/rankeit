using MediatR;
using Ranker.Common;
using Ranker.Dtos;

namespace Ranker.Application.Leaderboards;

/// <summary>Listings grouped by the day they received their first bid, most recent day first (rule for the "Day wise listing" page).</summary>
public sealed record GetDailyListingsQuery(int Page, int PageSize) : IRequest<PagedResult<DailyListingGroupDto>>;
