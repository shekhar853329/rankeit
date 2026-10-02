namespace Ranker.Services.Seo;

public interface IIndexNowService
{
    Task NotifyUrlChangeAsync(IEnumerable<string> urls, CancellationToken ct = default);
}
