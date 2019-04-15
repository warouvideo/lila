import { h } from 'snabbdom'
import { VNode } from 'snabbdom/vnode'
import * as chessground from './ground';
import { bind, onInsert, dataIcon, spinner } from './util';
import { getPlayer, playable } from 'game';
import * as router from 'game/router';
import statusView from 'game/view/status';
import { path as treePath } from 'tree';
import { render as renderTreeView } from './treeView/treeView';
import * as control from './control';
import { view as actionMenu } from './actionMenu';
import { view as renderPromotion } from './promotion';
// import renderClocks from './clocks';
import * as pgnExport from './pgnExport';
import forecastView from './forecast/forecastView';
import { view as cevalView } from 'ceval';
import crazyView from './crazy/crazyView';
import { view as keyboardView} from './keyboard';
import explorerView from './explorer/explorerView';
import retroView from './retrospect/retroView';
import practiceView from './practice/practiceView';
import * as gbEdit from './study/gamebook/gamebookEdit';
import * as gbPlay from './study/gamebook/gamebookPlayView';
import * as studyView from './study/studyView';
import * as studyPracticeView from './study/practice/studyPracticeView';
import { view as forkView } from './fork'
import { render as acplView } from './acpl'
import AnalyseCtrl from './ctrl';
import { ConcealOf } from './interfaces';
import relayManager from './study/relay/relayManagerView';
import renderPlayerBars from './study/playerBars';
import serverSideUnderboard from './serverSideUnderboard';

const li = window.lichess;

function renderResult(ctrl: AnalyseCtrl): VNode[] {
  let result: string | undefined;
  if (ctrl.data.game.status.id >= 30) switch (ctrl.data.game.winner) {
    case 'white':
      result = '1-0';
      break;
    case 'black':
      result = '0-1';
      break;
    default:
      result = '½-½';
  }
  const tags: VNode[] = [];
  if (result) {
    tags.push(h('div.result', result));
    const winner = getPlayer(ctrl.data, ctrl.data.game.winner!);
    tags.push(h('div.status', [
      statusView(ctrl),
      winner ? ', ' + ctrl.trans(winner.color == 'white' ? 'whiteIsVictorious' : 'blackIsVictorious') : null
    ]));
  }
  return tags;
}

function makeConcealOf(ctrl: AnalyseCtrl): ConcealOf | undefined {
  const conceal = (ctrl.study && ctrl.study.data.chapter.conceal !== undefined) ? {
    owner: ctrl.study.isChapterOwner(),
    ply: ctrl.study.data.chapter.conceal
  } : null;
  if (conceal) return function(isMainline: boolean) {
    return function(path: Tree.Path, node: Tree.Node) {
      if (!conceal || (isMainline && conceal.ply >= node.ply)) return null;
      if (treePath.contains(ctrl.path, path)) return null;
      return conceal.owner ? 'conceal' : 'hide';
    };
  };
}

function renderAnalyse(ctrl: AnalyseCtrl, concealOf?: ConcealOf) {
  return h('div.analyse__moves.areplay', [
    renderChapterName(ctrl),
    renderOpeningBox(ctrl),
    renderTreeView(ctrl, concealOf),
  ].concat(renderResult(ctrl)));
}

function wheel(ctrl: AnalyseCtrl, e: WheelEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName !== 'PIECE' && target.tagName !== 'SQUARE' && !target.classList.contains('cg-board')) return;
  e.preventDefault();
  if (e.deltaY > 0) control.next(ctrl);
  else if (e.deltaY < 0) control.prev(ctrl);
  ctrl.redraw();
  return false;
}

function inputs(ctrl: AnalyseCtrl): VNode | undefined {
  if (ctrl.ongoing || !ctrl.data.userAnalysis) return;
  if (ctrl.redirecting) return spinner();
  return h('div.copyables', [
    h('div.pair', [
      h('label.name', 'FEN'),
      h('input.copyable.autoselect.analyse__underboard__fen', {
        attrs: {
          spellCheck: false,
          value: ctrl.node.fen
        },
        hook: bind('change', e => {
          const value = (e.target as HTMLInputElement).value;
          if (value !== ctrl.node.fen) ctrl.changeFen(value);
        })
      })
    ]),
    h('div.pgn', [
      h('div.pair', [
        h('label.name', 'PGN'),
        h('textarea.copyable.autoselect', {
          attrs: { spellCheck: false },
          hook: {
            postpatch: (_, vnode) => {
              (vnode.elm as HTMLInputElement).value = pgnExport.renderFullTxt(ctrl);
            }
          }
        })
      ]),
      h('div.action', [
        h('button.button.button-thin.text', {
          attrs: dataIcon('G'),
          hook: bind('click', _ => {
            const pgn = $('.copyables .pgn textarea').val();
            if (pgn !== pgnExport.renderFullTxt(ctrl)) ctrl.changePgn(pgn);
          }, ctrl.redraw)
        }, ctrl.trans.noarg('importPgn'))
      ])
    ])
  ]);
}

function jumpButton(icon: string, effect: string, enabled: boolean): VNode {
  return h('button.fbt', {
    class: { disabled: !enabled },
    attrs: { 'data-act': effect, 'data-icon': icon }
  });
}

function dataAct(e: Event): string | null {
  const target = e.target as HTMLElement;
  return target.getAttribute('data-act') ||
    (target.parentNode as HTMLElement).getAttribute('data-act');
}


function navClick(ctrl: AnalyseCtrl, action: 'prev' | 'next') {
  const repeat = function() {
    control[action](ctrl);
    ctrl.redraw();
    delay = Math.max(100, delay - delay / 15);
    timeout = setTimeout(repeat, delay);
  };
  let delay = 350;
  let timeout = setTimeout(repeat, 500);
  control[action](ctrl);
  document.addEventListener('mouseup', function() {
    clearTimeout(timeout);
  }, {once: true} as any);
}

function controls(ctrl: AnalyseCtrl) {
  const canJumpPrev = ctrl.path !== '',
    canJumpNext = !!ctrl.node.children[0],
    menuIsOpen = ctrl.actionMenu.open,
    noarg = ctrl.trans.noarg;
  return h('div.analyse__controls.analyse-controls', {
    hook: bind('mousedown', e => {
      const action = dataAct(e);
      if (action === 'prev' || action === 'next') navClick(ctrl, action);
      else if (action === 'first') control.first(ctrl);
      else if (action === 'last') control.last(ctrl);
      else if (action === 'explorer') ctrl.toggleExplorer();
      else if (action === 'practice') ctrl.togglePractice();
      else if (action === 'menu') ctrl.actionMenu.toggle();
    }, ctrl.redraw)
  }, [
    ctrl.embed ? null : h('div.features', ctrl.studyPractice ? [
      h('a.fbt', {
        attrs: {
          title: noarg('analysis'),
          target: '_blank',
          href: ctrl.studyPractice.analysisUrl(),
          'data-icon': 'A'
        }
      })
    ] : [
      h('button.fbt', {
        attrs: {
          title: noarg('openingExplorerAndTablebase'),
          'data-act': 'explorer',
          'data-icon': ']'
        },
        class: {
          hidden: menuIsOpen || !ctrl.explorer.allowed() || !!ctrl.retro,
          active: ctrl.explorer.enabled()
        }
      }),
      ctrl.ceval.possible && ctrl.ceval.allowed() && !ctrl.isGamebook() ? h('button.fbt', {
        attrs: {
          title: noarg('practiceWithComputer'),
          'data-act': 'practice',
          'data-icon': ''
        },
        class: {
          hidden: menuIsOpen || !!ctrl.retro,
          active: !!ctrl.practice
        }
      }) : null
    ]),
    h('div.jumps', [
      jumpButton('W', 'first', canJumpPrev),
      jumpButton('Y', 'prev', canJumpPrev),
      jumpButton('X', 'next', canJumpNext),
      jumpButton('V', 'last', canJumpNext)
    ]),
    ctrl.studyPractice ? h('div.noop') : h('button.fbt', {
      class: { active: menuIsOpen },
      attrs: {
        title: noarg('menu'),
        'data-act': 'menu',
        'data-icon': '['
      }
    })
  ]);
}

function renderOpeningBox(ctrl: AnalyseCtrl) {
  let opening = ctrl.tree.getOpening(ctrl.nodeList);
  if (!opening && !ctrl.path) opening = ctrl.data.game.opening;
  if (opening) return h('div.opening_box', {
    attrs: { title: opening.eco + ' ' + opening.name }
  }, [
    h('strong', opening.eco),
    ' ' + opening.name
  ]);
}

function renderChapterName(ctrl: AnalyseCtrl) {
  if (ctrl.embed && ctrl.study) return h('div.chapter_name', ctrl.study.currentChapter().name);
}

const innerCoordsCss = 'stylesheets/board.coords.inner.css';

function forceInnerCoords(ctrl: AnalyseCtrl, v: boolean) {
  const pref = ctrl.data.pref.coords;
  if (!pref) return;
  if (v) li.loadCss(innerCoordsCss);
  else if (pref === 2) unloadCss(innerCoordsCss);
}

function unloadCss(url) {
  if (li.loadedCss[url]) {
    delete li.loadedCss[url];
    $('head link[rel=stylesheet]')
      .filter(function(this: HTMLLinkElement) { return this.href.includes(url) })
      .remove();
  }
}

let firstRender = true;

export default function(ctrl: AnalyseCtrl): VNode {
  if (ctrl.nvui) return ctrl.nvui.render(ctrl);
  const concealOf = makeConcealOf(ctrl),
    study = ctrl.study,
    showCevalPvs = !(ctrl.retro && ctrl.retro.isSolving()) && !ctrl.practice,
    menuIsOpen = ctrl.actionMenu.open,
    chapter = study && study.data.chapter,
    studyStateClass = chapter ? chapter.id + study!.vm.loading : 'nostudy',
    gamebookPlay = ctrl.gamebookPlay(),
    gamebookPlayView = gamebookPlay && gbPlay.render(gamebookPlay),
    gamebookEditView = gbEdit.running(ctrl) ? gbEdit.render(ctrl) : undefined,
    playerBars = renderPlayerBars(ctrl),
    gaugeOn = ctrl.showEvalGauge(),
    needsInnerCoords = !!gaugeOn || !!playerBars;
  return h('main.analyse.' + studyStateClass, {
    hook: {
      insert: _ => {
        if (firstRender) {
          firstRender = false;
          if (ctrl.data.pref.coords === 1) li.loadedCss[innerCoordsCss] = true;
        }
        forceInnerCoords(ctrl, needsInnerCoords);
      },
      update(_, _2) {
        forceInnerCoords(ctrl, needsInnerCoords);
      },
      postpatch(old, vnode) {
        if (old.data!.gaugeOn !== gaugeOn) {
          li.dispatchEvent(document.body, 'chessground.resize');
        }
        vnode.data!.gaugeOn = gaugeOn;
      }
    },
    class: {
      'gauge-on': gaugeOn,
      'has-players': !!playerBars
    }
  }, [
    gaugeOn ? cevalView.renderGauge(ctrl) : null,
    ctrl.keyboardHelp ? keyboardView(ctrl) : null,
    ctrl.study ? studyView.overboard(ctrl.study) : null,
    h('div.analyse__board.main-board.' + ctrl.data.game.variant.key + '.' + ctrl.bottomColor(), {
      hook: ctrl.gamebookPlay() ? undefined : bind('wheel', (e: WheelEvent) => wheel(ctrl, e))
    }, [
      playerBars ? playerBars[ctrl.bottomIsWhite() ? 1 : 0] : null,
      chessground.render(ctrl),
      playerBars ? playerBars[ctrl.bottomIsWhite() ? 0 : 1] : null,
      renderPromotion(ctrl)
    ]),
    menuIsOpen ? null : crazyView(ctrl, ctrl.topColor(), 'top'),
    gamebookPlayView || h('div.analyse__tools', [
      // menuIsOpen || playerBars ? null : renderClocks(ctrl),
      ...(menuIsOpen ? [actionMenu(ctrl)] : [
        cevalView.renderCeval(ctrl),
        showCevalPvs ? cevalView.renderPvs(ctrl) : null,
        renderAnalyse(ctrl, concealOf),
        gamebookEditView || forkView(ctrl, concealOf),
        retroView(ctrl) || practiceView(ctrl) || explorerView(ctrl)
      ])
    ]),
    menuIsOpen ? null : crazyView(ctrl, ctrl.bottomColor(), 'bottom'),
    gamebookPlayView ? null : controls(ctrl),
    ctrl.embed ? null : h('div.analyse__underboard', {
      class: { 'comp-off': !ctrl.showComputer() },
      hook: ctrl.synthetic ? undefined : onInsert(elm => serverSideUnderboard(elm, ctrl))
    }, ctrl.study ? studyView.underboard(ctrl) : [inputs(ctrl)]),
    h('div.analyse__acpl', [acplView(ctrl)]),
    ctrl.embed ? null : (
      ctrl.studyPractice ? studyPracticeView.side(ctrl.study!) :
      h('aside.analyse__side', {
        hook: onInsert(elm => {
          ctrl.opts.$side && $(elm).replaceWith(ctrl.opts.$side);
        })
      }, [
        ctrl.studyPractice ? studyPracticeView.side(ctrl.study!) : (
          ctrl.study ? studyView.side(ctrl.study) : (
            ctrl.forecast ? forecastView(ctrl, ctrl.forecast) : null,
            (!ctrl.synthetic && playable(ctrl.data)) ? h('div.back_to_game',
              h('a.button.text', {
                attrs: {
                  href: ctrl.data.player.id ? router.player(ctrl.data) : router.game(ctrl.data),
                  'data-icon': 'i'
                }
              }, ctrl.trans.noarg('backToGame'))
            ) : null
          )
        )
      ])
    ),
    study && study.relay && relayManager(study.relay),
    ctrl.opts.chat && h('section.mchat', {
      hook: onInsert(_ => {
        ctrl.opts.chat.parseMoves = true;
        li.makeChat(ctrl.opts.chat);
      })
    }),
    h('div.analyse__underchat', {
      hook: onInsert(elm => {
        $(elm).replaceWith($('.analyse__underchat.none').removeClass('none'));
      })
    })
  ]);
}
