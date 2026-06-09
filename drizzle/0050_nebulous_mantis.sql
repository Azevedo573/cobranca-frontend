CREATE TABLE `atendimentoAvaliacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`atendimentoId` int NOT NULL,
	`nota` int NOT NULL,
	`comentario` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atendimentoAvaliacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoDepartamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` text,
	`cor` varchar(20) NOT NULL DEFAULT '#6366f1',
	`instanciaId` int,
	`slaMinutos` int NOT NULL DEFAULT 60,
	`limiteChatsSimultaneos` int NOT NULL DEFAULT 5,
	`distribuicaoAutomatica` int NOT NULL DEFAULT 1,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentoDepartamentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoEtiquetas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(80) NOT NULL,
	`cor` varchar(20) NOT NULL DEFAULT '#22c55e',
	`descricao` text,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atendimentoEtiquetas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoEtiquetasAplicadas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`atendimentoId` int NOT NULL,
	`etiquetaId` int NOT NULL,
	`aplicadoPorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atendimentoEtiquetasAplicadas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoMensagensRapidas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titulo` varchar(100) NOT NULL,
	`atalho` varchar(50) NOT NULL,
	`conteudo` text NOT NULL,
	`departamentoId` int,
	`criadoPorId` int NOT NULL,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentoMensagensRapidas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoNotas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`atendimentoId` int NOT NULL,
	`autorId` int NOT NULL,
	`conteudo` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentoNotas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoOperadores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`departamentoId` int NOT NULL,
	`status` enum('online','offline','ausente','ocupado') NOT NULL DEFAULT 'offline',
	`limiteChats` int NOT NULL DEFAULT 5,
	`chatsAtivos` int NOT NULL DEFAULT 0,
	`ultimaAtividade` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentoOperadores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoStatusLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operadorId` int NOT NULL,
	`statusAnterior` varchar(20),
	`statusNovo` varchar(20) NOT NULL,
	`motivo` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atendimentoStatusLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentoTransferencias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`atendimentoId` int NOT NULL,
	`deOperadorId` int,
	`paraOperadorId` int,
	`paraDepartamentoId` int,
	`motivo` text,
	`transferidoPorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atendimentoTransferencias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversaId` int NOT NULL,
	`departamentoId` int,
	`operadorId` int,
	`devedorId` int,
	`cobrancaId` int,
	`protocolo` varchar(30) NOT NULL,
	`status` enum('aguardando','em_atendimento','transferido','resolvido','abandonado') NOT NULL DEFAULT 'aguardando',
	`prioridade` enum('baixa','normal','alta','urgente') NOT NULL DEFAULT 'normal',
	`slaLimite` timestamp,
	`slaViolado` int NOT NULL DEFAULT 0,
	`tempoEspera` int,
	`tempoAtendimento` int,
	`iniciadoEm` timestamp NOT NULL DEFAULT (now()),
	`atendidoEm` timestamp,
	`resolvidoEm` timestamp,
	`motivoFechamento` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentos_id` PRIMARY KEY(`id`)
);
