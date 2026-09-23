using MediatR;

namespace Ranker.Application.Analytics;

/// <summary>Increments today's aggregate visit counter by one and returns the new total.</summary>
public sealed record IncrementSiteVisitCountCommand : IRequest<int>;
