package lila.streamer

import akka.actor._
import com.softwaremill.macwire._
import io.methvin.play.autoconfig._
import play.api.Configuration
import scala.concurrent.duration._

import lila.common.config._

@Module
private class StreamerConfig(
    @ConfigName("collection.streamer") val streamerColl: CollName,
    @ConfigName("paginator.max_per_page") val paginatorMaxPerPage: MaxPerPage,
    @ConfigName("streaming.keyword") val keyword: Stream.Keyword,
    @ConfigName("streaming.google.api_key") val googleApiKey: Secret,
    @ConfigName("streaming.twitch.client_id") val twitchClientId: Secret
)

@Module
final class Env(
    appConfig: Configuration,
    ws: play.api.libs.ws.WSClient,
    settingStore: lila.memo.SettingStore.Builder,
    renderer: lila.hub.actors.Renderer,
    isOnline: lila.socket.IsOnline,
    asyncCache: lila.memo.AsyncCache.Builder,
    notifyApi: lila.notify.NotifyApi,
    lightUserApi: lila.user.LightUserApi,
    userRepo: lila.user.UserRepo,
    timeline: lila.hub.actors.Timeline,
    db: lila.db.Db,
    imageRepo: lila.db.ImageRepo
)(implicit system: ActorSystem) {

  implicit private val keywordLoader = strLoader(Stream.Keyword.apply)
  private val config                 = appConfig.get[StreamerConfig]("streamer")(AutoConfig.loader)

  private lazy val streamerColl = db(config.streamerColl)

  private lazy val photographer = new lila.db.Photographer(imageRepo, "streamer")

  lazy val alwaysFeaturedSetting = {
    import lila.memo.SettingStore.Strings._
    import lila.common.Strings
    settingStore[Strings](
      "streamerAlwaysFeatured",
      default = Strings(Nil),
      text =
        "Twitch streamers who get featured without the keyword - lichess usernames separated by a comma".some
    )
  }

  lazy val api: StreamerApi = wire[StreamerApi]

  lazy val pager = wire[StreamerPager]

  private val streamingActor = system.actorOf(
    Props(
      new Streaming(
        ws = ws,
        renderer = renderer,
        api = api,
        isOnline = isOnline,
        timeline = timeline,
        keyword = config.keyword,
        alwaysFeatured = alwaysFeaturedSetting.get _,
        googleApiKey = config.googleApiKey,
        twitchClientId = config.twitchClientId,
        lightUserApi = lightUserApi
      )
    )
  )

  lazy val liveStreamApi = wire[LiveStreamApi]

  lila.common.Bus.subscribeFun("adjustCheater") {
    case lila.hub.actorApi.mod.MarkCheater(userId, true) => api demote userId
  }

  system.scheduler.scheduleWithFixedDelay(1 hour, 1 day) { () =>
    api.autoDemoteFakes
  }
}
