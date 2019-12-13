package controllers

import akka.pattern.ask
import com.github.ghik.silencer.silent
import play.api.data._, Forms._
import play.api.libs.json._
import play.api.mvc._

import lila.app._
import lila.common.HTTPRequest
import lila.hub.actorApi.captcha.ValidCaptcha
import makeTimeout.large
import views._

final class Main(
    env: Env,
    prismicC: Prismic,
    assetsC: Assets
) extends LilaController(env) {

  private lazy val blindForm = Form(
    tuple(
      "enable"   -> nonEmptyText,
      "redirect" -> nonEmptyText
    )
  )

  def toggleBlindMode = OpenBody { implicit ctx =>
    implicit val req = ctx.body
    fuccess {
      blindForm.bindFromRequest.fold(
        _ => BadRequest, {
          case (enable, redirect) =>
            Redirect(redirect) withCookies env.lilaCookie.cookie(
              env.api.config.accessibility.blindCookieName,
              if (enable == "0") "" else env.api.config.accessibility.hash,
              maxAge = env.api.config.accessibility.blindCookieMaxAge.toSeconds.toInt.some,
              httpOnly = true.some
            )
        }
      )
    }
  }

  def handlerNotFound(req: RequestHeader) = reqToCtx(req) map renderNotFound

  def captchaCheck(id: String) = Open { implicit ctx =>
    env.hub.captcher.actor ? ValidCaptcha(id, ~get("solution")) map {
      case valid: Boolean => Ok(if (valid) 1 else 0)
    }
  }

  def webmasters = Open { implicit ctx =>
    pageHit
    fuccess {
      html.site.help.webmasters()
    }
  }

  def lag = Open { implicit ctx =>
    pageHit
    fuccess {
      html.site.lag()
    }
  }

  def mobile = Open { implicit ctx =>
    pageHit
    OptionOk(prismicC getBookmark "mobile-apk") {
      case (doc, resolver) => html.mobile(doc, resolver)
    }
  }

  def jslog(id: String) = Open { ctx =>
    env.round.selfReport(
      userId = ctx.userId,
      ip = HTTPRequest lastRemoteAddress ctx.req,
      fullId = lila.game.Game.FullId(id),
      name = get("n", ctx.req) | "?"
    )
    NoContent.fuccess
  }

  /**
    * Event monitoring endpoint
    */
  def jsmon(event: String) = Action {
    lila.mon.http.jsmon(event).increment
    NoContent
  }

  private lazy val glyphsResult: Result = {
    import chess.format.pgn.Glyph
    import lila.tree.Node.glyphWriter
    Ok(
      Json.obj(
        "move"        -> (Glyph.MoveAssessment.display: List[Glyph]),
        "position"    -> (Glyph.PositionAssessment.display: List[Glyph]),
        "observation" -> (Glyph.Observation.display: List[Glyph])
      )
    ) as JSON
  }
  val glyphs = Action(glyphsResult)

  def image(id: String, @silent hash: String, @silent name: String) = Action.async { req =>
    env.imageRepo.fetch(id) map {
      case None => NotFound
      case Some(image) =>
        lila.log("image").info(s"Serving ${image.path} to ${HTTPRequest printClient req}")
        Ok(image.data).withHeaders(
          CONTENT_DISPOSITION -> image.name
        ) as image.contentType.getOrElse("image/jpeg")
    }
  }

  val robots = Action { req =>
    Ok {
      if (env.net.crawlable && req.domain == env.net.domain.value) """User-agent: *
Allow: /
Disallow: /game/export
Disallow: /games/export
"""
      else "User-agent: *\nDisallow: /"
    }
  }

  def getFishnet = Open { implicit ctx =>
    Ok(html.site.bits.getFishnet()).fuccess
  }

  def costs = Action {
    Redirect("https://docs.google.com/spreadsheets/d/1CGgu-7aNxlZkjLl9l-OlL00fch06xp0Q7eCVDDakYEE/preview")
  }

  def verifyTitle = Action {
    Redirect(
      "https://docs.google.com/forms/d/e/1FAIpQLSd64rDqXOihJzPlBsQba75di5ioL-WMFhkInS2_vhVTvDtBag/viewform"
    )
  }

  def contact = Open { implicit ctx =>
    Ok(html.site.contact()).fuccess
  }

  def faq = Open { implicit ctx =>
    Ok(html.site.faq()).fuccess
  }

  def movedPermanently(to: String) = Action {
    MovedPermanently(to)
  }

  def instantChess = Open { implicit ctx =>
    if (ctx.isAuth) fuccess(Redirect(routes.Lobby.home))
    else
      fuccess {
        Redirect(s"${routes.Lobby.home}#pool/10+0").withCookies(
          env.lilaCookie.withSession { s =>
            s + ("theme" -> "ic") + ("pieceSet" -> "icpieces")
          }
        )
      }
  }

  def legacyQaQuestion(id: Int, @silent slug: String) = Open { _ =>
    MovedPermanently {
      val faq = routes.Main.faq.url
      id match {
        case 103  => s"$faq#acpl"
        case 258  => s"$faq#marks"
        case 13   => s"$faq#titles"
        case 87   => routes.Stat.ratingDistribution("blitz").url
        case 110  => s"$faq#name"
        case 29   => s"$faq#titles"
        case 4811 => s"$faq#lm"
        case 216  => routes.Main.mobile.url
        case 340  => s"$faq#trophies"
        case 6    => s"$faq#ratings"
        case 207  => s"$faq#hide-ratings"
        case 547  => s"$faq#leaving"
        case 259  => s"$faq#trophies"
        case 342  => s"$faq#provisional"
        case 50   => routes.Page.help.url
        case 46   => s"$faq#name"
        case 122  => s"$faq#marks"
        case _    => faq
      }
    }.fuccess
  }

  def devAsset(@silent v: String, file: String) = assetsC.at(file)
}
