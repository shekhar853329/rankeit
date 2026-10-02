using MediatR;
using Ranker.Dtos;

namespace Ranker.Application.Listings;

/// <summary>Fetches a full website profile by its URL-slug (e.g. "example-com"), for the public /website/:slug page.</summary>
public sealed record GetWebsiteProfileQuery(string Slug) : IRequest<WebsiteProfileDto?>;
