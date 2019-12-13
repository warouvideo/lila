package lila.api

import lila.common.Bus
import lila.hub.actorApi.Deploy

final private[api] class Cli(
    userRepo: lila.user.UserRepo,
    security: lila.security.Env,
    i18n: lila.i18n.Env,
    teamSearch: lila.teamSearch.Env,
    forumSearch: lila.forumSearch.Env,
    team: lila.team.Env,
    puzzle: lila.puzzle.Env,
    tournament: lila.tournament.Env,
    explorer: lila.explorer.Env,
    fishnet: lila.fishnet.Env,
    study: lila.study.Env,
    studySearch: lila.studySearch.Env,
    coach: lila.coach.Env,
    evalCache: lila.evalCache.Env,
    plan: lila.plan.Env
) extends lila.common.Cli {

  private val logger = lila.log("cli")

  def apply(args: List[String]): Fu[String] = run(args).map(_ + "\n") ~ {
    _.logFailure(logger, _ => args mkString " ") foreach { output =>
      logger.info("%s\n%s".format(args mkString " ", output))
    }
  }

  def process = {
    case "uptime" :: Nil           => fuccess(s"${lila.common.Uptime.seconds} seconds")
    case "deploy" :: "pre" :: Nil  => remindDeploy(lila.hub.actorApi.DeployPre)
    case "deploy" :: "post" :: Nil => remindDeploy(lila.hub.actorApi.DeployPost)
    case "change" :: ("asset" | "assets") :: "version" :: Nil =>
      import lila.common.AssetVersion
      AssetVersion.change
      fuccess(s"Changed to ${AssetVersion.current}")
    case "gdpr" :: "erase" :: username :: "forever" :: Nil =>
      userRepo named username map {
        case None                       => "No such user."
        case Some(user) if user.enabled => "That user account is not closed. Can't erase."
        case Some(user) =>
          Bus.publish(lila.user.User.GDPRErase(user), "gdprErase")
          s"Erasing all data about ${user.username} now"
      }
    case "announce" :: "cancel" :: Nil =>
      AnnounceStore set none
      Bus.publish(AnnounceStore.cancel, "announce")
      fuccess("Removed announce")
    case "announce" :: msgWords =>
      AnnounceStore.set(msgWords mkString " ") match {
        case Some(announce) =>
          Bus.publish(announce, "announce")
          fuccess(announce.json.toString)
        case None =>
          fuccess(
            "Invalid announce. Format: `announce <length> <unit> <words...>` or just `announce cancel` to cancel it"
          )
      }
  }

  private def remindDeploy(event: Deploy): Fu[String] = {
    Bus.publish(event, "deploy")
    fuccess("Deploy in progress")
  }

  private def run(args: List[String]): Fu[String] = {
    (processors lift args) | fufail("Unknown command: " + args.mkString(" "))
  } recover {
    case e: Exception => "ERROR " + e
  }

  private def processors =
    security.cli.process orElse
      i18n.cli.process orElse
      teamSearch.cli.process orElse
      forumSearch.cli.process orElse
      team.cli.process orElse
      puzzle.cli.process orElse
      tournament.cli.process orElse
      explorer.cli.process orElse
      fishnet.cli.process orElse
      study.cli.process orElse
      studySearch.cli.process orElse
      coach.cli.process orElse
      evalCache.cli.process orElse
      plan.cli.process orElse
      process
}
