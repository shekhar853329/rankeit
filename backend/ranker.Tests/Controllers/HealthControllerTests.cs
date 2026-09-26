using Microsoft.AspNetCore.Mvc;
using Ranker.Controllers;
using Ranker.Dtos;
using Xunit;

namespace Ranker.Tests.Controllers;

public class HealthControllerTests
{
    [Fact]
    public void CheckHead_ReturnsOkResult()
    {
        var controller = new HealthController(null!);
        var result = controller.CheckHead();

        Assert.IsType<OkResult>(result);
    }

    [Fact]
    public void HealthStatusDto_PropertiesAssignedCorrectly()
    {
        var now = DateTime.UtcNow;
        var dto = new HealthStatusDto(
            Status: "Healthy",
            Database: "Connected",
            Timestamp: now,
            Uptime: "01h 23m 45s",
            Version: "1.0.0"
        );

        Assert.Equal("Healthy", dto.Status);
        Assert.Equal("Connected", dto.Database);
        Assert.Equal(now, dto.Timestamp);
        Assert.Equal("01h 23m 45s", dto.Uptime);
        Assert.Equal("1.0.0", dto.Version);
    }
}
